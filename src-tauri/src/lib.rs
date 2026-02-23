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

#[tauri::command]
async fn add_video(app: tauri::AppHandle, file_path: String, file_name: String) -> Result<i64, String> {
    db::add_video(&app, &file_path, &file_name).await
}

#[tauri::command]
async fn save_clip(
    app: tauri::AppHandle,
    video_id: i64,
    clip_type: String,
    start_time: f64,
    end_time: f64,
) -> Result<i64, String> {
    // Enforce 5-second maximum
    let max_end = start_time + 5.0;
    let actual_end = if end_time > max_end { max_end } else { end_time };
    db::save_clip(&app, video_id, &clip_type, start_time, actual_end).await
}

#[tauri::command]
async fn add_tag(
    app: tauri::AppHandle,
    clip_id: i64,
    player: String,
    action: String,
    result: String,
    shot_type: Option<String>,
) -> Result<i64, String> {
    // Check tag count before adding
    let count = db::get_tag_count(&app, clip_id).await?;
    if count >= 3 {
        return Err("Maximum of 3 tags per clip reached.".to_string());
    }
    db::add_tag(&app, clip_id, &player, &action, &result, shot_type.as_deref()).await
}

#[tauri::command]
async fn get_clips(app: tauri::AppHandle, video_id: i64) -> Result<Vec<Clip>, String> {
    db::get_clips(&app, video_id).await
}

#[tauri::command]
async fn delete_clip(app: tauri::AppHandle, clip_id: i64) -> Result<(), String> {
    db::delete_clip(&app, clip_id).await
}

#[tauri::command]
async fn export_clip(
    app: tauri::AppHandle,
    clip_id: i64,
    output_dir: String,
) -> Result<String, String> {
    let clips = db::get_clip_by_id(&app, clip_id).await?;
    let clip = clips.first().ok_or("Clip not found")?;

    // Get the video path
    let video = db::get_video_by_id(&app, clip.video_id).await?;

    let output_filename = format!(
        "{}_{}_{}s-{}s.mp4",
        video.file_name.replace('.', "_"),
        clip.clip_type,
        clip.start_time as i64,
        clip.end_time as i64
    );
    let output_path = format!("{}/{}", output_dir, output_filename);

    // Use std::process::Command for FFmpeg
    let status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video.file_path,
            "-ss", &clip.start_time.to_string(),
            "-to", &clip.end_time.to_string(),
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run FFmpeg: {}. Make sure FFmpeg is installed.", e))?;

    if status.status.success() {
        Ok(output_path)
    } else {
        let stderr = String::from_utf8_lossy(&status.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

#[tauri::command]
async fn export_all_clips(
    app: tauri::AppHandle,
    video_id: i64,
    output_dir: String,
) -> Result<Vec<String>, String> {
    let clips = db::get_clips(&app, video_id).await?;
    let mut exported = Vec::new();

    for clip in &clips {
        match export_clip(app.clone(), clip.id, output_dir.clone()).await {
            Ok(path) => exported.push(path),
            Err(e) => return Err(format!("Failed to export clip {}: {}", clip.id, e)),
        }
    }

    Ok(exported)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db::initialize(&handle).await {
                    eprintln!("Database initialization error: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_video,
            save_clip,
            add_tag,
            get_clips,
            delete_clip,
            export_clip,
            export_all_clips,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
