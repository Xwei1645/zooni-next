use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const ASSIGNMENTS_FILE_NAME: &str = "assignments.json";
const PERSIST_DELAY: Duration = Duration::from_millis(500);

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Assignment {
    id: String,
    subject_id: String,
    // Stored as plain text for now; later this contains Lexical's serialized editor state.
    content: String,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct AssignmentInput {
    subject_id: String,
    content: String,
}

#[derive(Clone)]
struct AssignmentSnapshot {
    assignments: Vec<Assignment>,
    revision: u64,
}

struct AssignmentStore {
    snapshot: Mutex<AssignmentSnapshot>,
    path: Option<PathBuf>,
}

#[derive(Clone)]
pub struct AssignmentState(Arc<AssignmentStore>);

impl AssignmentState {
    pub fn load(app: &AppHandle) -> Self {
        let path = match assignments_path(app) {
            Ok(path) => Some(path),
            Err(error) => {
                eprintln!("Failed to resolve assignments path: {error}");
                None
            }
        };
        let assignments = path
            .as_deref()
            .and_then(|path| load_assignments(path).ok())
            .unwrap_or_else(|| {
                let assignments = Vec::new();

                if let Some(path) = path.as_deref() {
                    if let Err(error) = write_assignments(path, &assignments) {
                        eprintln!("Failed to write default assignments: {error}");
                    }
                }

                assignments
            });

        Self(Arc::new(AssignmentStore {
            snapshot: Mutex::new(AssignmentSnapshot {
                assignments,
                revision: 0,
            }),
            path,
        }))
    }

    fn assignments(&self) -> Result<Vec<Assignment>, String> {
        self.0
            .snapshot
            .lock()
            .map(|snapshot| snapshot.assignments.clone())
            .map_err(|error| error.to_string())
    }

    fn create(&self, input: AssignmentInput) -> Result<(Vec<Assignment>, u64), String> {
        validate_input(&input)?;
        let timestamp = timestamp();
        let mut snapshot = self.0.snapshot.lock().map_err(|error| error.to_string())?;
        snapshot.assignments.insert(
            0,
            Assignment {
                id: Uuid::new_v4().to_string(),
                subject_id: input.subject_id,
                content: input.content,
                created_at: timestamp.clone(),
                updated_at: timestamp,
            },
        );
        snapshot.revision += 1;
        Ok((snapshot.assignments.clone(), snapshot.revision))
    }

    fn update(&self, id: String, input: AssignmentInput) -> Result<(Vec<Assignment>, u64), String> {
        validate_input(&input)?;
        let mut snapshot = self.0.snapshot.lock().map_err(|error| error.to_string())?;
        let assignment = snapshot
            .assignments
            .iter_mut()
            .find(|assignment| assignment.id == id)
            .ok_or_else(|| "Assignment is unavailable".to_string())?;

        assignment.subject_id = input.subject_id;
        assignment.content = input.content;
        assignment.updated_at = timestamp();
        snapshot.revision += 1;
        Ok((snapshot.assignments.clone(), snapshot.revision))
    }

    fn delete(&self, id: String) -> Result<(Vec<Assignment>, u64), String> {
        let mut snapshot = self.0.snapshot.lock().map_err(|error| error.to_string())?;
        let count = snapshot.assignments.len();
        snapshot
            .assignments
            .retain(|assignment| assignment.id != id);

        if snapshot.assignments.len() == count {
            return Err("Assignment is unavailable".into());
        }

        snapshot.revision += 1;
        Ok((snapshot.assignments.clone(), snapshot.revision))
    }

    fn schedule_persist(&self, revision: u64) {
        let state = self.clone();

        thread::spawn(move || {
            thread::sleep(PERSIST_DELAY);

            let assignments = match state.0.snapshot.lock() {
                Ok(snapshot) if snapshot.revision == revision => snapshot.assignments.clone(),
                Ok(_) => return,
                Err(error) => {
                    eprintln!("Failed to access assignments for persistence: {error}");
                    return;
                }
            };
            let Some(path) = state.0.path.as_deref() else {
                return;
            };

            if let Err(error) = write_assignments(path, &assignments) {
                eprintln!("Failed to persist assignments: {error}");
            }
        });
    }
}

#[tauri::command]
pub fn get_assignments(state: State<'_, AssignmentState>) -> Result<Vec<Assignment>, String> {
    state.assignments()
}

#[tauri::command]
pub fn create_assignment(
    app: AppHandle,
    state: State<'_, AssignmentState>,
    assignment: AssignmentInput,
) -> Result<Vec<Assignment>, String> {
    let (assignments, revision) = state.create(assignment)?;
    broadcast_assignments(&app, &assignments);
    state.schedule_persist(revision);
    Ok(assignments)
}

#[tauri::command]
pub fn update_assignment(
    app: AppHandle,
    state: State<'_, AssignmentState>,
    id: String,
    assignment: AssignmentInput,
) -> Result<Vec<Assignment>, String> {
    let (assignments, revision) = state.update(id, assignment)?;
    broadcast_assignments(&app, &assignments);
    state.schedule_persist(revision);
    Ok(assignments)
}

#[tauri::command]
pub fn delete_assignment(
    app: AppHandle,
    state: State<'_, AssignmentState>,
    id: String,
) -> Result<Vec<Assignment>, String> {
    let (assignments, revision) = state.delete(id)?;
    broadcast_assignments(&app, &assignments);
    state.schedule_persist(revision);
    Ok(assignments)
}

fn validate_input(input: &AssignmentInput) -> Result<(), String> {
    if Uuid::parse_str(&input.subject_id).is_err() {
        return Err("Assignment subject is invalid".into());
    }

    Ok(())
}

fn broadcast_assignments(app: &AppHandle, assignments: &[Assignment]) {
    if let Err(error) = app.emit("assignments-changed", assignments) {
        eprintln!("Failed to broadcast assignments update: {error}");
    }
}

fn load_assignments(path: &Path) -> Result<Vec<Assignment>, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let assignments =
        serde_json::from_str::<Vec<Assignment>>(&contents).map_err(|error| error.to_string())?;
    validate_assignments(&assignments)?;
    Ok(assignments)
}

fn write_assignments(path: &Path, assignments: &[Assignment]) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Assignments directory is unavailable".to_string())?;

    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let contents = serde_json::to_string_pretty(assignments).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn validate_assignments(assignments: &[Assignment]) -> Result<(), String> {
    let mut ids = HashSet::new();

    for assignment in assignments {
        if Uuid::parse_str(&assignment.id).is_err()
            || Uuid::parse_str(&assignment.subject_id).is_err()
            || !ids.insert(&assignment.id)
            || chrono::DateTime::parse_from_rfc3339(&assignment.created_at).is_err()
            || chrono::DateTime::parse_from_rfc3339(&assignment.updated_at).is_err()
        {
            return Err("Assignments are invalid".into());
        }
    }

    Ok(())
}

fn assignments_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(ASSIGNMENTS_FILE_NAME))
        .map_err(|error| error.to_string())
}

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::{validate_assignments, validate_input, Assignment, AssignmentInput};

    #[test]
    fn accepts_empty_content() {
        assert!(validate_input(&AssignmentInput {
            subject_id: "9680f713-4204-4cac-9c8f-93bb2c5020af".into(),
            content: String::new(),
        })
        .is_ok());
    }

    #[test]
    fn rejects_invalid_subject_id() {
        assert!(validate_input(&AssignmentInput {
            subject_id: "mathematics".into(),
            content: "Read chapter one".into(),
        })
        .is_err());
    }

    #[test]
    fn rejects_invalid_persisted_timestamp() {
        let assignments = vec![Assignment {
            id: "9680f713-4204-4cac-9c8f-93bb2c5020af".into(),
            subject_id: "a7a582ed-7016-424a-bf7c-1a03045b0975".into(),
            content: String::new(),
            created_at: "not-a-timestamp".into(),
            updated_at: "2026-07-24T10:30:00.000Z".into(),
        }];

        assert!(validate_assignments(&assignments).is_err());
    }
}
