// Validation helpers for the Courtvision Rust backend.
// All database operations are handled by the frontend via tauri-plugin-sql.
// This module is kept as a placeholder for future Rust-side DB needs.

pub fn validate_clip_type(clip_type: &str) -> Result<(), String> {
    if clip_type != "Offense" && clip_type != "Defense" {
        return Err("Clip type must be 'Offense' or 'Defense'".to_string());
    }
    Ok(())
}

pub fn validate_result(result: &str) -> Result<(), String> {
    let valid = ["Score", "Miss", "Foul", "Turnover"];
    if !valid.contains(&result) {
        return Err(format!("Result must be one of: {:?}", valid));
    }
    Ok(())
}
