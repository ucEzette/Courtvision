use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

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
    app_handle: tauri::AppHandle,
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

    // Sanitize the clip_type so custom labels don't break the filesystem during export
    let safe_clip_type = clip_type.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-', "_");

    let output_filename = format!(
        "{}_{}_{}s-{}s.mp4",
        file_name.replace('.', "_"),
        safe_clip_type,
        start_time as i64,
        end_time as i64
    );
    let output_path = format!("{}/{}", output_dir.trim_end_matches('/'), output_filename);

    let duration = end_time - start_time;

    let sidecar_command = app_handle.shell().sidecar("ffmpeg")
        .map_err(|e| format!("Failed to find FFmpeg sidecar: {}", e))?;

    let output = sidecar_command
        .args([
            "-y",
            "-ss", &format!("{:.3}", start_time),
            "-i", &video_path,
            "-t", &format!("{:.3}", duration),
            "-map", "0:v",
            "-map", "0:a?",
            "-c:v", "copy",
            "-c:a", "copy",
            "-avoid_negative_ts", "make_zero",
            &output_path,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to execute FFmpeg sidecar: {}", e))?;

    if output.status.success() {
        Ok(output_path)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("FFmpeg error: {}", stderr))
    }
}

/// Check if FFmpeg is available (now bundled as a sidecar).
#[tauri::command]
async fn check_ffmpeg(app_handle: tauri::AppHandle) -> Result<bool, String> {
    Ok(app_handle.shell().sidecar("ffmpeg").is_ok())
}

/// Returns the port the local streaming server is running on.
#[tauri::command]
async fn get_stream_port(state: tauri::State<'_, StreamPort>) -> Result<u16, String> {
    Ok(state.0)
}

struct StreamPort(u16);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Start the local streaming server
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("Failed to bind to random port");
    listener.set_nonblocking(true).expect("Cannot set non-blocking");
    let port = listener.local_addr().unwrap().port();

    tauri::Builder::default()
        .manage(StreamPort(port))
        .setup(move |_app| {
            // Spawn the Axum server in a background Tokio task
            tauri::async_runtime::spawn(async move {
                use axum::Router;
                use tower_http::cors::{Any, CorsLayer};
                use tower_http::services::ServeDir;

                let cors = CorsLayer::new()
                    .allow_origin(Any)
                    .allow_methods(Any)
                    .allow_headers(Any);

                // Serve the entire filesystem (read-only) for video streaming
                // The frontend will request /Users/name/... via http://localhost:PORT/Users/name/...
                let app = Router::new()
                    .nest_service("/", ServeDir::new("/"))
                    .layer(cors);

                let listener = tokio::net::TcpListener::from_std(listener).unwrap();
                println!("Streaming server listening on {}", listener.local_addr().unwrap());
                axum::serve(listener, app).await.unwrap();
            });

            Ok(())
        })
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
            get_stream_port,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
