use std::sync::{Arc, Mutex};

use chrono::Utc;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;

use crate::settings::UpdatePolicy;

const UPDATE_EVENT: &str = "updater-changed";

#[derive(Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdateStatus {
    Idle,
    Checking,
    UpToDate,
    Available,
    Failed,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnapshot {
    status: UpdateStatus,
    current_version: String,
    available_version: Option<String>,
    notes: Option<String>,
    last_checked_at: Option<String>,
    error: Option<String>,
}

#[derive(Clone)]
pub struct UpdateState(Arc<Mutex<UpdateSnapshot>>);

impl UpdateState {
    pub fn new(app: &AppHandle) -> Self {
        Self(Arc::new(Mutex::new(UpdateSnapshot {
            status: UpdateStatus::Idle,
            current_version: app.package_info().version.to_string(),
            available_version: None,
            notes: None,
            last_checked_at: None,
            error: None,
        })))
    }

    fn snapshot(&self) -> Result<UpdateSnapshot, String> {
        self.0
            .lock()
            .map(|snapshot| snapshot.clone())
            .map_err(|error| error.to_string())
    }

    fn update_snapshot(
        &self,
        app: &AppHandle,
        update: impl FnOnce(&mut UpdateSnapshot),
    ) -> Result<(), String> {
        let snapshot = {
            let mut snapshot = self.0.lock().map_err(|error| error.to_string())?;
            update(&mut snapshot);
            snapshot.clone()
        };

        app.emit(UPDATE_EVENT, snapshot)
            .map_err(|error| error.to_string())
    }

    async fn check(&self, app: &AppHandle) -> Result<(), String> {
        self.update_snapshot(app, |snapshot| {
            snapshot.status = UpdateStatus::Checking;
            snapshot.last_checked_at = Some(Utc::now().to_rfc3339());
            snapshot.error = None;
        })?;

        match app
            .updater()
            .map_err(|error| error.to_string())?
            .check()
            .await
        {
            Ok(Some(update)) => self.update_snapshot(app, |snapshot| {
                snapshot.status = UpdateStatus::Available;
                snapshot.available_version = Some(update.version);
                snapshot.notes = update.body;
            }),
            Ok(None) => self.update_snapshot(app, |snapshot| {
                snapshot.status = UpdateStatus::UpToDate;
                snapshot.available_version = None;
                snapshot.notes = None;
            }),
            Err(error) => self.update_snapshot(app, |snapshot| {
                snapshot.status = UpdateStatus::Failed;
                snapshot.error = Some(error.to_string());
            }),
        }
    }

    pub async fn apply_policy(&self, app: &AppHandle, policy: UpdatePolicy) -> Result<(), String> {
        if policy == UpdatePolicy::Notify {
            self.check(app).await?;
        }

        Ok(())
    }
}

#[tauri::command]
pub fn get_update_snapshot(state: State<'_, UpdateState>) -> Result<UpdateSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle, state: State<'_, UpdateState>) -> Result<(), String> {
    state.check(&app).await
}

#[tauri::command]
pub async fn apply_update_policy(
    app: AppHandle,
    state: State<'_, UpdateState>,
    policy: UpdatePolicy,
) -> Result<(), String> {
    state.apply_policy(&app, policy).await
}
