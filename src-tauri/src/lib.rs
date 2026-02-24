use serde::{Deserialize, Serialize};

mod db;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Video {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Clip {
    pub id: i64,
    pub video_id: i64,
    pub clip_type: String,
    pub start_time: f64,
    pub end_time: f64,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: i64,
    pub clip_id: i64,
    pub player: String,
    pub action: String,
    pub result: String,
    pub shot_type: Option<String>,
}

/// Export a single clip using FFmpeg.
/// All data is passed directly from the frontend — no Rust-side DB queries needed.
#[tauri::command]
async fn export_clip(
    video_path: String,
    clip_type: String,
    start_time: f64,
    end_time: f64,
    file_name: String,
    output_dir: String,
) -> Result<String, String> {
    // Validate inputs
    if video_path.is_empty() {
        return Err("Video path is required".to_string());
    }
    if start_time >= end_time {
        return Err("Invalid time range".to_string());
    }

    let output_filename = format!(
        "{}_{}_{}s-{}s.mp4",
        file_name.replace('.', "_"),
        clip_type,
        start_time as i64,
        end_time as i64
    );
    let output_path = format!("{}/{}", output_dir.trim_end_matches('/'), output_filename);

    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video_path,
            "-ss", &format!("{:.3}", start_time),
            "-to", &format!("{:.3}", end_time),
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run FFmpeg: {}. Make sure FFmpeg is installed (brew install ffmpeg).", e))?;

    if status.status.success() {
        Ok(output_path)
    } else {
        let stderr = String::from_utf8_lossy(&status.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

/// Check if FFmpeg is installed on the system.
#[tauri::command]
async fn check_ffmpeg() -> Result<bool, String> {
    match std::process::Command::new("ffmpeg").arg("-version").output() {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            export_clip,
            check_ffmpeg,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
