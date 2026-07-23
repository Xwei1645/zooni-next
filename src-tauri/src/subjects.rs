use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const SUBJECTS_FILE_NAME: &str = "subjects.json";
const PERSIST_DELAY: Duration = Duration::from_millis(500);

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Subject {
    id: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SubjectInput {
    name: String,
}

#[derive(Clone)]
struct SubjectSnapshot {
    subjects: Vec<Subject>,
    revision: u64,
}

struct SubjectStore {
    snapshot: Mutex<SubjectSnapshot>,
    path: Option<PathBuf>,
}

#[derive(Clone)]
pub struct SubjectState(Arc<SubjectStore>);

impl SubjectState {
    pub fn load(app: &AppHandle) -> Self {
        let path = match subjects_path(app) {
            Ok(path) => Some(path),
            Err(error) => {
                eprintln!("Failed to resolve subjects path: {error}");
                None
            }
        };
        let subjects = path
            .as_deref()
            .and_then(|path| load_subjects(path).ok())
            .unwrap_or_else(|| {
                let subjects = Vec::new();

                if let Some(path) = path.as_deref() {
                    if let Err(error) = write_subjects(path, &subjects) {
                        eprintln!("Failed to write default subjects: {error}");
                    }
                }

                subjects
            });

        Self(Arc::new(SubjectStore {
            snapshot: Mutex::new(SubjectSnapshot {
                subjects,
                revision: 0,
            }),
            path,
        }))
    }

    fn subjects(&self) -> Result<Vec<Subject>, String> {
        self.0
            .snapshot
            .lock()
            .map(|snapshot| snapshot.subjects.clone())
            .map_err(|error| error.to_string())
    }

    fn create(&self, input: SubjectInput) -> Result<(Vec<Subject>, u64), String> {
        validate_name(&input.name)?;
        let mut snapshot = self.0.snapshot.lock().map_err(|error| error.to_string())?;
        snapshot.subjects.insert(0, Subject {
            id: Uuid::new_v4().to_string(),
            name: input.name,
        });
        snapshot.revision += 1;
        Ok((snapshot.subjects.clone(), snapshot.revision))
    }

    fn update(&self, id: String, input: SubjectInput) -> Result<(Vec<Subject>, u64), String> {
        validate_name(&input.name)?;
        let mut snapshot = self.0.snapshot.lock().map_err(|error| error.to_string())?;
        let subject = snapshot
            .subjects
            .iter_mut()
            .find(|subject| subject.id == id)
            .ok_or_else(|| "Subject is unavailable".to_string())?;

        subject.name = input.name;
        snapshot.revision += 1;
        Ok((snapshot.subjects.clone(), snapshot.revision))
    }

    fn delete(&self, id: String) -> Result<(Vec<Subject>, u64), String> {
        let mut snapshot = self.0.snapshot.lock().map_err(|error| error.to_string())?;
        let count = snapshot.subjects.len();
        snapshot.subjects.retain(|subject| subject.id != id);

        if snapshot.subjects.len() == count {
            return Err("Subject is unavailable".into());
        }

        snapshot.revision += 1;
        Ok((snapshot.subjects.clone(), snapshot.revision))
    }

    fn schedule_persist(&self, revision: u64) {
        let state = self.clone();

        thread::spawn(move || {
            thread::sleep(PERSIST_DELAY);

            let subjects = match state.0.snapshot.lock() {
                Ok(snapshot) if snapshot.revision == revision => snapshot.subjects.clone(),
                Ok(_) => return,
                Err(error) => {
                    eprintln!("Failed to access subjects for persistence: {error}");
                    return;
                }
            };
            let Some(path) = state.0.path.as_deref() else {
                return;
            };

            if let Err(error) = write_subjects(path, &subjects) {
                eprintln!("Failed to persist subjects: {error}");
            }
        });
    }
}

#[tauri::command]
pub fn get_subjects(state: State<'_, SubjectState>) -> Result<Vec<Subject>, String> {
    state.subjects()
}

#[tauri::command]
pub fn create_subject(
    app: AppHandle,
    state: State<'_, SubjectState>,
    subject: SubjectInput,
) -> Result<Vec<Subject>, String> {
    let (subjects, revision) = state.create(subject)?;
    broadcast_subjects(&app, &subjects);
    state.schedule_persist(revision);
    Ok(subjects)
}

#[tauri::command]
pub fn update_subject(
    app: AppHandle,
    state: State<'_, SubjectState>,
    id: String,
    subject: SubjectInput,
) -> Result<Vec<Subject>, String> {
    let (subjects, revision) = state.update(id, subject)?;
    broadcast_subjects(&app, &subjects);
    state.schedule_persist(revision);
    Ok(subjects)
}

#[tauri::command]
pub fn delete_subject(
    app: AppHandle,
    state: State<'_, SubjectState>,
    id: String,
) -> Result<Vec<Subject>, String> {
    let (subjects, revision) = state.delete(id)?;
    broadcast_subjects(&app, &subjects);
    state.schedule_persist(revision);
    Ok(subjects)
}

fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        Err("Subject name is required".into())
    } else {
        Ok(())
    }
}

fn broadcast_subjects(app: &AppHandle, subjects: &[Subject]) {
    if let Err(error) = app.emit("subjects-changed", subjects) {
        eprintln!("Failed to broadcast subjects update: {error}");
    }
}

fn load_subjects(path: &Path) -> Result<Vec<Subject>, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let subjects =
        serde_json::from_str::<Vec<Subject>>(&contents).map_err(|error| error.to_string())?;
    validate_subjects(&subjects)?;
    Ok(subjects)
}

fn write_subjects(path: &Path, subjects: &[Subject]) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Subjects directory is unavailable".to_string())?;

    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let contents = serde_json::to_string_pretty(subjects).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn validate_subjects(subjects: &[Subject]) -> Result<(), String> {
    let mut ids = HashSet::new();

    for subject in subjects {
        validate_name(&subject.name)?;

        if Uuid::parse_str(&subject.id).is_err() || !ids.insert(&subject.id) {
            return Err("Subjects are invalid".into());
        }
    }

    Ok(())
}

fn subjects_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(SUBJECTS_FILE_NAME))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{validate_name, validate_subjects, Subject};

    #[test]
    fn accepts_duplicate_and_whitespace_names() {
        let subjects = vec![
            Subject {
                id: "9680f713-4204-4cac-9c8f-93bb2c5020af".into(),
                name: " 数学 ".into(),
            },
            Subject {
                id: "a7a582ed-7016-424a-bf7c-1a03045b0975".into(),
                name: " 数学 ".into(),
            },
        ];

        assert!(validate_subjects(&subjects).is_ok());
    }

    #[test]
    fn rejects_only_empty_names() {
        assert!(validate_name("").is_err());
        assert!(validate_name("   ").is_ok());
    }
}
