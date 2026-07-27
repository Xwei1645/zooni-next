use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

const BOARD_STATE_FILE_NAME: &str = "board-state.json";
const PERSIST_DELAY: Duration = Duration::from_millis(500);
const DEFAULT_COLUMN_COUNT: u8 = 3;
const DEFAULT_ZOOM: u16 = 100;
const DEFAULT_AUTO_COLUMN_COUNT: bool = false;
const DEFAULT_AUTO_ZOOM: bool = false;

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct BoardStateData {
    column_count: u8,
    auto_column_count: bool,
    auto_zoom: bool,
    zoom: u16,
}

impl BoardStateData {
    fn is_valid(&self) -> bool {
        (1..=10).contains(&self.column_count) && (50..=200).contains(&self.zoom)
    }
}

impl Default for BoardStateData {
    fn default() -> Self {
        Self {
            column_count: DEFAULT_COLUMN_COUNT,
            auto_column_count: DEFAULT_AUTO_COLUMN_COUNT,
            auto_zoom: DEFAULT_AUTO_ZOOM,
            zoom: DEFAULT_ZOOM,
        }
    }
}

struct BoardStateStore {
    state: Mutex<BoardStateData>,
    path: Option<PathBuf>,
}

#[derive(Clone)]
pub struct BoardState(Arc<BoardStateStore>);

impl BoardState {
    pub fn load(app: &AppHandle) -> Self {
        let path = match state_path(app) {
            Ok(path) => Some(path),
            Err(error) => {
                eprintln!("Failed to resolve board state path: {error}");
                None
            }
        };
        let state = path
            .as_deref()
            .and_then(|path| load_state(path).ok())
            .unwrap_or_else(|| {
                let defaults = BoardStateData::default();

                if let Some(path) = path.as_deref() {
                    if let Err(error) = write_state(path, &defaults) {
                        eprintln!("Failed to write default board state: {error}");
                    }
                }

                defaults
            });

        Self(Arc::new(BoardStateStore {
            state: Mutex::new(state),
            path,
        }))
    }

    fn snapshot(&self) -> Result<BoardStateData, String> {
        self.0
            .state
            .lock()
            .map(|state| state.clone())
            .map_err(|error| error.to_string())
    }

    fn update(&self, state: BoardStateData) -> Result<(), String> {
        if !state.is_valid() {
            return Err("Board state is invalid".into());
        }

        *self.0.state.lock().map_err(|error| error.to_string())? = state;
        Ok(())
    }

    fn schedule_persist(&self) {
        let state = self.clone();

        thread::spawn(move || {
            thread::sleep(PERSIST_DELAY);

            let snapshot = match state.snapshot() {
                Ok(snapshot) => snapshot,
                Err(error) => {
                    eprintln!("Failed to access board state for persistence: {error}");
                    return;
                }
            };
            let Some(path) = state.0.path.as_deref() else {
                return;
            };

            if let Err(error) = write_state(path, &snapshot) {
                eprintln!("Failed to persist board state: {error}");
            }
        });
    }
}

#[tauri::command]
pub fn get_board_state(state: State<'_, BoardState>) -> Result<BoardStateData, String> {
    state.snapshot()
}

#[tauri::command]
pub fn update_board_state(
    state: State<'_, BoardState>,
    board_state: BoardStateData,
) -> Result<(), String> {
    state.update(board_state)?;
    state.schedule_persist();
    Ok(())
}

fn load_state(path: &Path) -> Result<BoardStateData, String> {
    let contents = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let state =
        serde_json::from_str::<BoardStateData>(&contents).map_err(|error| error.to_string())?;

    if state.is_valid() {
        Ok(state)
    } else {
        Err("Board state is invalid".into())
    }
}

fn write_state(path: &Path, state: &BoardStateData) -> Result<(), String> {
    let directory = path
        .parent()
        .ok_or_else(|| "Board state directory is unavailable".to_string())?;

    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let contents = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(BOARD_STATE_FILE_NAME))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::BoardStateData;

    #[test]
    fn accepts_defaults_for_existing_state_files() {
        let state = serde_json::from_str::<BoardStateData>("{}").expect("defaults should load");

        assert_eq!(state.column_count, 3);
        assert!(!state.auto_column_count);
        assert!(!state.auto_zoom);
        assert_eq!(state.zoom, 100);
    }

    #[test]
    fn rejects_out_of_range_values() {
        let state = serde_json::from_str::<BoardStateData>(r#"{"columnCount":11,"zoom":100}"#)
            .expect("state should deserialize before semantic validation");

        assert!(!state.is_valid());
    }
}
