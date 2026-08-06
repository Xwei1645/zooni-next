use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

use chrono::Utc;
use log::error;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::settings::UpdatePolicy;
use crate::verification::{updater_pubkey, verify_package};

const UPDATE_EVENT: &str = "updater-changed";
const UPDATE_FILE_NAME: &str = "update.json";
const PERSIST_DELAY: Duration = Duration::from_millis(500);
const INSTALLER_DIRECTORY: &str = "zooni-next-updates";
const INSTALLER_PREFIX: &str = "zooni-next-update-";
const INSTALLER_SUFFIX: &str = ".installer";
const AUTO_RETRY_LIMIT: u32 = 3;
const RETRY_DELAY: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateStatus {
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Downloaded,
    Installing,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateErrorKind {
    Check,
    Download,
    Signature,
    Install,
    Cache,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnapshot {
    status: UpdateStatus,
    current_version: String,
    available_version: Option<String>,
    notes: Option<String>,
    last_checked_at: Option<String>,
    error_kind: Option<UpdateErrorKind>,
    error: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct UpdateResults {
    last_checked_at: Option<String>,
    available_version: Option<String>,
    notes: Option<String>,
    error_kind: Option<UpdateErrorKind>,
    error: Option<String>,
}

struct PendingUpdate {
    update: Update,
    path: Option<PathBuf>,
}

struct UpdateInner {
    snapshot: UpdateSnapshot,
    pending: Option<PendingUpdate>,
    cached: HashMap<String, PathBuf>,
    current_policy: Option<UpdatePolicy>,
    revision: u64,
}

#[derive(Clone)]
pub struct UpdateState {
    inner: Arc<Mutex<UpdateInner>>,
    path: Option<PathBuf>,
    busy: Arc<AtomicBool>,
    resume_requested: Arc<AtomicBool>,
}

impl UpdateState {
    pub fn load(app: &AppHandle) -> Self {
        let current_version = app.package_info().version.clone();
        let path = match update_results_path(app) {
            Ok(path) => Some(path),
            Err(error) => {
                error!("failed to resolve update results path: {error}");
                None
            }
        };

        let (status, results) = path
            .as_deref()
            .and_then(|path| load_results(path).ok())
            .map(|results| (derive_status(&results), results))
            .unwrap_or_else(|| {
                let results = UpdateResults::default();

                if let Some(path) = path.as_deref() {
                    if let Err(error) = write_results(path, &results) {
                        error!("failed to write default update results: {error}");
                    }
                }

                (UpdateStatus::Idle, results)
            });

        let mut cached = load_cached_installers();

        let removable: Vec<(String, PathBuf)> = cached
            .iter()
            .filter(|(version, _)| {
                semver::Version::parse(version)
                    .map(|parsed| parsed <= current_version)
                    .unwrap_or(true)
            })
            .map(|(version, path)| (version.clone(), path.clone()))
            .collect();

        for (version, path) in &removable {
            cached.remove(version);
            let _ = fs::remove_file(path);
        }

        Self {
            inner: Arc::new(Mutex::new(UpdateInner {
                snapshot: UpdateSnapshot {
                    status,
                    current_version: current_version.to_string(),
                    available_version: results.available_version,
                    notes: results.notes,
                    last_checked_at: results.last_checked_at,
                    error_kind: results.error_kind,
                    error: results.error,
                },
                pending: None,
                cached,
                current_policy: None,
                revision: 0,
            })),
            path,
            busy: Arc::new(AtomicBool::new(false)),
            resume_requested: Arc::new(AtomicBool::new(false)),
        }
    }

    fn set_current_policy(&self, policy: Option<UpdatePolicy>) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.current_policy = policy;
        }
    }

    fn current_policy(&self) -> Option<UpdatePolicy> {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.current_policy)
    }

    fn snapshot(&self) -> Result<UpdateSnapshot, String> {
        self.inner
            .lock()
            .map(|inner| inner.snapshot.clone())
            .map_err(|error| error.to_string())
    }

    fn results_with_revision(&self) -> Result<(UpdateResults, u64), String> {
        let inner = self.inner.lock().map_err(|error| error.to_string())?;

        Ok((
            UpdateResults {
                last_checked_at: inner.snapshot.last_checked_at.clone(),
                available_version: inner.snapshot.available_version.clone(),
                notes: inner.snapshot.notes.clone(),
                error_kind: inner.snapshot.error_kind,
                error: inner.snapshot.error.clone(),
            },
            inner.revision,
        ))
    }

    fn schedule_persist(&self, revision: u64) {
        let state = self.clone();

        thread::spawn(move || {
            thread::sleep(PERSIST_DELAY);

            let (results, current) = match state.results_with_revision() {
                Ok(value) => value,
                Err(error) => {
                    error!("failed to access update results for persistence: {error}");
                    return;
                }
            };

            if current != revision {
                return;
            }

            let Some(path) = state.path.as_deref() else {
                return;
            };

            if let Err(error) = write_results(path, &results) {
                error!("failed to persist update results: {error}");
            }
        });
    }

    fn mutate(
        &self,
        app: &AppHandle,
        update: impl FnOnce(&mut UpdateSnapshot, &mut Option<PendingUpdate>),
    ) -> Result<(), String> {
        let (snapshot, revision) = {
            let mut inner = self.inner.lock().map_err(|error| error.to_string())?;
            let UpdateInner {
                snapshot,
                pending,
                cached: _,
                current_policy: _,
                revision,
            } = &mut *inner;
            update(snapshot, pending);
            *revision += 1;
            (snapshot.clone(), *revision)
        };

        let persistable = is_persistable(&snapshot.status);
        app.emit(UPDATE_EVENT, snapshot)
            .map_err(|error| error.to_string())?;

        if persistable {
            self.schedule_persist(revision);
        }

        Ok(())
    }

    fn fail(&self, app: &AppHandle, kind: UpdateErrorKind, message: &str) -> Result<(), String> {
        self.mutate(app, |snapshot, _| {
            snapshot.status = UpdateStatus::Failed;
            snapshot.error_kind = Some(kind);
            snapshot.error = Some(message.to_string());
        })?;
        Err(message.to_string())
    }

    fn pending_update(&self) -> Result<Update, String> {
        self.inner
            .lock()
            .map_err(|error| error.to_string())?
            .pending
            .as_ref()
            .map(|pending| pending.update.clone())
            .ok_or_else(|| "没有可用的更新".into())
    }

    fn stash_installer(&self, bytes: &[u8], version: &str) -> Result<PathBuf, String> {
        let directory = std::env::temp_dir().join(INSTALLER_DIRECTORY);
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

        let path = directory.join(installer_file_name(version));
        fs::write(&path, bytes).map_err(|error| error.to_string())?;
        Ok(path)
    }

    fn record_stash(&self, version: &str, path: &PathBuf) {
        let previous = {
            let mut inner = match self.inner.lock() {
                Ok(inner) => inner,
                Err(_) => return,
            };
            let previous: Vec<PathBuf> = inner.cached.values().cloned().collect();
            inner.cached.clear();
            inner.cached.insert(version.to_string(), path.clone());
            previous
        };

        for file in previous {
            let _ = fs::remove_file(file);
        }
    }

    fn discard_cached_version(&self, version: &str) {
        let path = self
            .inner
            .lock()
            .ok()
            .and_then(|mut inner| inner.cached.remove(version));
        if let Some(path) = path {
            let _ = fs::remove_file(path);
        }
    }

    async fn check(&self, app: &AppHandle) -> Result<(), String> {
        self.mutate(app, |snapshot, _| {
            snapshot.status = UpdateStatus::Checking;
            snapshot.last_checked_at = Some(Utc::now().to_rfc3339());
            snapshot.error_kind = None;
            snapshot.error = None;
        })?;

        let checked = app
            .updater()
            .map_err(|error| error.to_string())?
            .check()
            .await;

        match checked {
            Ok(Some(update)) => {
                let version = update.version.clone();
                let cached_path = self
                    .inner
                    .lock()
                    .map_err(|error| error.to_string())?
                    .cached
                    .get(&version)
                    .cloned();

                if let Some(path) = cached_path {
                    let verified =
                        fs::read(&path)
                            .map_err(|error| error.to_string())
                            .and_then(|bytes| {
                                let pubkey =
                                    updater_pubkey(app).map_err(|error| error.to_string())?;
                                verify_package(&bytes, &update.signature, &pubkey)
                                    .map_err(|error| error.to_string())
                            });

                    if verified.is_ok() {
                        return self.mutate(app, |snapshot, pending| {
                            snapshot.status = UpdateStatus::Downloaded;
                            snapshot.available_version = Some(version.clone());
                            snapshot.notes = update.body.clone();
                            snapshot.error_kind = None;
                            snapshot.error = None;
                            if let Some(pending) = pending {
                                if let Some(old) = pending.path.take() {
                                    if old != path {
                                        let _ = fs::remove_file(old);
                                    }
                                }
                                pending.update = update.clone();
                                pending.path = Some(path.clone());
                            } else {
                                *pending = Some(PendingUpdate {
                                    update,
                                    path: Some(path),
                                });
                            }
                        });
                    }

                    log::warn!("cached installer for {version} failed verification, discarding");
                    self.discard_cached_version(&version);
                }

                self.mutate(app, |snapshot, pending| {
                    snapshot.status = UpdateStatus::Available;
                    snapshot.available_version = Some(version);
                    snapshot.notes = update.body.clone();
                    snapshot.error_kind = None;
                    snapshot.error = None;
                    *pending = Some(PendingUpdate { update, path: None });
                })
            }
            Ok(None) => self.mutate(app, |snapshot, pending| {
                snapshot.status = UpdateStatus::UpToDate;
                snapshot.available_version = None;
                snapshot.notes = None;
                snapshot.error_kind = None;
                snapshot.error = None;
                *pending = None;
            }),
            Err(error) => self.fail(app, UpdateErrorKind::Check, &error.to_string()),
        }
    }

    async fn download(&self, app: &AppHandle) -> Result<(), String> {
        let update = self.pending_update()?;
        let version = update.version.clone();

        self.mutate(app, |snapshot, _| {
            snapshot.status = UpdateStatus::Downloading;
            snapshot.error_kind = None;
            snapshot.error = None;
        })?;

        let bytes = match update.download(|_, _| {}, || {}).await {
            Ok(bytes) => bytes,
            Err(error) => {
                let message = format!("下载更新失败：{error}");
                return self.fail(app, UpdateErrorKind::Download, &message);
            }
        };

        let path = match self.stash_installer(&bytes, &version) {
            Ok(path) => path,
            Err(error) => {
                let message = format!("保存更新文件失败：{error}");
                return self.fail(app, UpdateErrorKind::Download, &message);
            }
        };
        self.record_stash(&version, &path);

        self.mutate(app, |snapshot, pending| {
            snapshot.status = UpdateStatus::Downloaded;
            snapshot.error_kind = None;
            snapshot.error = None;
            if let Some(pending) = pending {
                pending.path = Some(path);
            }
        })?;

        Ok(())
    }

    async fn install(&self, app: &AppHandle) -> Result<(), String> {
        let (update, path) = {
            let inner = self.inner.lock().map_err(|error| error.to_string())?;
            let pending = inner
                .pending
                .as_ref()
                .ok_or_else(|| "没有可用的更新".to_string())?;
            let path = pending
                .path
                .clone()
                .ok_or_else(|| "更新尚未下载完成".to_string())?;
            (pending.update.clone(), path)
        };

        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => {
                let message = "已下载的更新文件丢失".to_string();
                self.discard_cached_version(&update.version);
                self.mutate(app, |snapshot, pending| {
                    snapshot.status = UpdateStatus::Failed;
                    snapshot.error_kind = Some(UpdateErrorKind::Cache);
                    snapshot.error = Some(message.clone());
                    if let Some(pending) = pending {
                        pending.path = None;
                    }
                })?;
                return Err(message);
            }
        };

        self.verify_and_install(app, &update, &bytes).await
    }

    async fn verify_and_install(
        &self,
        app: &AppHandle,
        update: &Update,
        bytes: &[u8],
    ) -> Result<(), String> {
        let pubkey = match updater_pubkey(app) {
            Ok(pubkey) => pubkey,
            Err(error) => {
                let message = error.to_string();
                return self.fail(app, UpdateErrorKind::Signature, &message);
            }
        };

        if let Err(error) = verify_package(bytes, &update.signature, &pubkey) {
            log::error!("installer signature verification failed: {error}");
            self.discard_cached_version(&update.version);
            let message = "安装包签名校验失败，文件可能已被篡改或损坏，请重新下载".to_string();
            self.mutate(app, |snapshot, pending| {
                snapshot.status = UpdateStatus::Failed;
                snapshot.error_kind = Some(UpdateErrorKind::Signature);
                snapshot.error = Some(message.clone());
                if let Some(pending) = pending {
                    pending.path = None;
                }
            })?;
            return Err(message);
        }

        self.mutate(app, |snapshot, _| {
            snapshot.status = UpdateStatus::Installing;
            snapshot.error_kind = None;
            snapshot.error = None;
        })?;

        match update.install(bytes) {
            Ok(()) => {
                self.mutate(app, |snapshot, pending| {
                    snapshot.status = UpdateStatus::UpToDate;
                    snapshot.available_version = None;
                    snapshot.notes = None;
                    snapshot.error_kind = None;
                    snapshot.error = None;
                    if let Some(pending) = pending {
                        if let Some(path) = pending.path.take() {
                            let _ = fs::remove_file(path);
                        }
                    }
                    *pending = None;
                })?;
                self.discard_cached_version(&update.version);
                Ok(())
            }
            Err(error) => {
                let message = format!("安装更新失败：{error}");
                self.fail(app, UpdateErrorKind::Install, &message)
            }
        }
    }

    async fn install_or_fetch(&self, app: &AppHandle) -> Result<(), String> {
        // A cold start only restores the persisted results, so the runtime
        // pending update may be missing until a check re-establishes it.
        if self.pending_update().is_err() {
            self.check(app).await?;
        }

        let has_stash = self
            .inner
            .lock()
            .map_err(|error| error.to_string())?
            .pending
            .as_ref()
            .and_then(|pending| pending.path.as_ref())
            .is_some();

        if has_stash {
            self.install(app).await
        } else {
            self.download(app).await?;
            self.install(app).await
        }
    }

    async fn run_auto_policy(&self, app: &AppHandle, policy: UpdatePolicy) -> Result<(), String> {
        self.check(app).await?;

        let status = self.snapshot()?.status;

        match (status, policy) {
            (UpdateStatus::Available, UpdatePolicy::AutoDownload | UpdatePolicy::AutoInstall) => {
                self.download(app).await?;
                // Only one decision boundary needs re-evaluation: if the policy
                // changed while downloading, honour the latest policy instead of
                // blindly installing.
                if self.current_policy() == Some(UpdatePolicy::AutoInstall) {
                    self.install(app).await?;
                }
                Ok(())
            }
            (UpdateStatus::Downloaded, UpdatePolicy::AutoInstall) => self.install(app).await,
            _ => Ok(()),
        }
    }

    async fn run_policy_with_retry(
        &self,
        app: &AppHandle,
        policy: UpdatePolicy,
    ) -> Result<(), String> {
        if policy == UpdatePolicy::Notify {
            return self.run_auto_policy(app, policy).await;
        }

        let mut attempt = 0u32;

        loop {
            match self.run_auto_policy(app, policy).await {
                Ok(()) => return Ok(()),
                Err(error) => {
                    let terminal = self
                        .snapshot()
                        .ok()
                        .and_then(|snapshot| snapshot.error_kind)
                        .map_or(false, |kind| kind == UpdateErrorKind::Signature);

                    attempt += 1;
                    if terminal || attempt > AUTO_RETRY_LIMIT {
                        return Err(error);
                    }
                    tokio::time::sleep(RETRY_DELAY).await;
                }
            }
        }
    }

    async fn run_pending_if_any(&self, app: &AppHandle) {
        if self
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let policy = if self.resume_requested.swap(false, Ordering::SeqCst) {
            self.current_policy()
        } else {
            None
        };

        if let Some(policy) = policy {
            let _ = self.run_policy_with_retry(app, policy).await;
        }
        self.busy.store(false, Ordering::SeqCst);
    }

    pub async fn apply_policy(&self, app: &AppHandle, policy: UpdatePolicy) -> Result<(), String> {
        self.set_current_policy(if policy == UpdatePolicy::Disabled {
            None
        } else {
            Some(policy)
        });

        if policy == UpdatePolicy::Disabled {
            return Ok(());
        }

        if self
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            // Another operation is in flight; it will honour the new policy at its
            // next decision boundary, and a follow-up run is queued for afterwards.
            self.resume_requested.store(true, Ordering::SeqCst);
            return Ok(());
        }

        let result = self.run_policy_with_retry(app, policy).await;
        self.busy.store(false, Ordering::SeqCst);
        self.run_pending_if_any(app).await;
        result
    }

    async fn with_busy<F>(&self, app: &AppHandle, future: F) -> Result<(), String>
    where
        F: std::future::Future<Output = Result<(), String>>,
    {
        if self
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            // An automatic update is already in flight; nothing to do here.
            return Ok(());
        }

        let result = future.await;
        self.busy.store(false, Ordering::SeqCst);
        self.run_pending_if_any(app).await;
        result
    }
}

fn installer_file_name(version: &str) -> String {
    format!("{INSTALLER_PREFIX}{version}{INSTALLER_SUFFIX}")
}

fn file_version(name: &str) -> Option<String> {
    name.strip_prefix(INSTALLER_PREFIX)?
        .strip_suffix(INSTALLER_SUFFIX)
        .map(ToOwned::to_owned)
}

fn load_cached_installers() -> HashMap<String, PathBuf> {
    let directory = std::env::temp_dir().join(INSTALLER_DIRECTORY);
    let Ok(entries) = fs::read_dir(directory) else {
        return HashMap::new();
    };

    let mut cached = HashMap::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if let Some(version) = file_version(&name) {
            cached.insert(version, entry.path());
        }
    }
    cached
}

fn derive_status(results: &UpdateResults) -> UpdateStatus {
    if results.error.is_some() {
        UpdateStatus::Failed
    } else if results.available_version.is_some() {
        UpdateStatus::Available
    } else if results.last_checked_at.is_some() {
        UpdateStatus::UpToDate
    } else {
        UpdateStatus::Idle
    }
}

fn is_persistable(status: &UpdateStatus) -> bool {
    matches!(
        status,
        UpdateStatus::UpToDate
            | UpdateStatus::Available
            | UpdateStatus::Downloaded
            | UpdateStatus::Failed
    )
}

fn load_results(path: &Path) -> Result<UpdateResults, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str::<UpdateResults>(&contents).map_err(|error| error.to_string())
}

fn write_results(path: &Path, results: &UpdateResults) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Update results directory is unavailable".to_string())?;

    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let contents = serde_json::to_string_pretty(results).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn update_results_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(UPDATE_FILE_NAME))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_update_snapshot(state: State<'_, UpdateState>) -> Result<UpdateSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    state.with_busy(&app, state.check(&app)).await
}

#[tauri::command]
pub async fn install_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    state.with_busy(&app, state.install_or_fetch(&app)).await
}

#[tauri::command]
pub async fn apply_update_policy(
    app: AppHandle,
    state: State<'_, UpdateState>,
    policy: UpdatePolicy,
) -> Result<(), String> {
    state.apply_policy(&app, policy).await
}

#[cfg(test)]
mod tests {
    use super::{derive_status, UpdateErrorKind, UpdateResults, UpdateStatus};

    #[test]
    fn update_results_round_trip() {
        let results = UpdateResults {
            last_checked_at: Some("2026-08-06T12:00:00Z".into()),
            available_version: Some("1.1.0".into()),
            notes: Some("## 更新内容\n- 修复 bug".into()),
            error_kind: Some(UpdateErrorKind::Download),
            error: Some("下载更新失败：network".into()),
        };

        let json = serde_json::to_string(&results).expect("results should serialize");
        let decoded: UpdateResults =
            serde_json::from_str(&json).expect("results should deserialize");

        assert_eq!(decoded.last_checked_at, results.last_checked_at);
        assert_eq!(decoded.available_version, results.available_version);
        assert_eq!(decoded.notes, results.notes);
        assert_eq!(decoded.error_kind, results.error_kind);
        assert_eq!(decoded.error, results.error);
    }

    #[test]
    fn derives_status_from_results() {
        let failed = UpdateResults {
            available_version: Some("1.1.0".into()),
            error: Some("boom".into()),
            ..UpdateResults::default()
        };
        let available = UpdateResults {
            available_version: Some("1.1.0".into()),
            last_checked_at: Some("2026-08-06T12:00:00Z".into()),
            ..UpdateResults::default()
        };
        let up_to_date = UpdateResults {
            last_checked_at: Some("2026-08-06T12:00:00Z".into()),
            ..UpdateResults::default()
        };
        let idle = UpdateResults::default();

        assert_eq!(derive_status(&failed), UpdateStatus::Failed);
        assert_eq!(derive_status(&available), UpdateStatus::Available);
        assert_eq!(derive_status(&up_to_date), UpdateStatus::UpToDate);
        assert_eq!(derive_status(&idle), UpdateStatus::Idle);
    }
}
