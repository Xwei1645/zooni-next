use font_kit::source::SystemSource;

#[tauri::command]
pub fn list_system_fonts() -> Result<Vec<String>, String> {
    let mut families = SystemSource::new()
        .all_families()
        .map_err(|error| error.to_string())?;

    families.sort_by_key(|family| family.to_lowercase());
    families.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    Ok(families)
}
