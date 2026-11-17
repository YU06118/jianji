// 简记 · Tauri 桌面端入口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{Category, Record};
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

pub struct AppState {
    pub conn: Mutex<Connection>,
    pub appdata: PathBuf,
}

/// 更新器托管状态：updater_check 查到的新版本暂存于此，
/// 供 updater_download_install 取用（避免前端透传整个 Update 对象）。
pub struct UpdaterState {
    pub pending: Mutex<Option<tauri_plugin_updater::Update>>,
}

fn with_conn<T, F>(state: &tauri::State<'_, AppState>, f: F) -> Result<T, String>
where F: FnOnce(&Connection) -> rusqlite::Result<T> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    f(&conn).map_err(|e| e.to_string())
}

// ---------- 命令：记录 CRUD ----------
#[tauri::command]
fn list_records(state: tauri::State<'_, AppState>, include_deleted: Option<i32>) -> Result<Vec<Record>, String> {
    with_conn(&state, |c| db::list_records(c, include_deleted.unwrap_or(0)))
}

#[tauri::command]
fn save_record(state: tauri::State<'_, AppState>, record: Record) -> Result<(), String> {
    with_conn(&state, |c| db::upsert_record(c, &record))
}

#[tauri::command]
fn trash_record(state: tauri::State<'_, AppState>, id: String, deleted: i32) -> Result<(), String> {
    with_conn(&state, |c| db::set_deleted(c, &id, deleted))
}

#[tauri::command]
fn purge_trash(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_conn(&state, |c| c.execute("DELETE FROM records WHERE deleted=1", []).map(|_| ()))
}

// ---------- 命令：分类 ----------
#[tauri::command]
fn list_categories(state: tauri::State<'_, AppState>) -> Result<Vec<Category>, String> {
    with_conn(&state, |c| db::list_categories(c))
}
#[tauri::command]
fn save_category(state: tauri::State<'_, AppState>, category: Category) -> Result<(), String> {
    with_conn(&state, |c| db::upsert_category(c, &category))
}
#[tauri::command]
fn delete_category(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    with_conn(&state, |c| db::delete_category(c, &id))
}

// ---------- 命令：设置（同步码 / 主题 / 提醒）----------
#[tauri::command]
fn get_setting(state: tauri::State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    with_conn(&state, |c| db::get_setting(c, &key))
}
#[tauri::command]
fn set_setting(state: tauri::State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    with_conn(&state, |c| db::set_setting(c, &key, &value))
}

// ---------- 命令：备份 / 迁移（Q12/Q22）----------
#[tauri::command]
fn export_backup(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let records = db::list_records(&conn, 1).map_err(|e| e.to_string())?;
    let categories = db::list_categories(&conn).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "app": "简记", "version": 1,
        "exportedAt": chrono::Local::now().to_rfc3339(),
        "records": records, "categories": categories, "settings": {}
    }))
}

#[tauri::command]
fn import_backup(state: tauri::State<'_, AppState>, payload: String) -> Result<usize, String> {
    #[derive(serde::Deserialize)]
    struct Backup { records: Vec<Record>, #[serde(default)] categories: Vec<Category> }
    let b: Backup = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::replace_all(&mut conn, &b.records, &b.categories).map_err(|e| e.to_string())?;
    Ok(b.records.len())
}

#[tauri::command]
fn save_backup_to(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let records = db::list_records(&conn, 1).map_err(|e| e.to_string())?;
    let categories = db::list_categories(&conn).map_err(|e| e.to_string())?;
    let obj = serde_json::json!({
        "app": "简记", "version": 1,
        "exportedAt": chrono::Local::now().to_rfc3339(),
        "records": records, "categories": categories, "settings": {}
    });
    fs::write(&path, serde_json::to_string_pretty(&obj).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

// ---------- 命令：图片存入本地目录（Q20）----------
#[tauri::command]
fn save_image(state: tauri::State<'_, AppState>, src_path: String, name: String) -> Result<String, String> {
    let dir = db::images_dir(&state.appdata);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '_' || *c == '-').collect();
    let dest = dir.join(if safe.is_empty() { "receipt.png".to_string() } else { safe });
    fs::copy(&src_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest.file_name().unwrap().to_string_lossy().to_string())
}

#[tauri::command]
fn data_dir(state: tauri::State<'_, AppState>) -> String {
    state.appdata.to_string_lossy().to_string()
}

// ---------- 命令：热更新（自动更新）----------
const OFFICIAL_ENDPOINT: &str =
    "https://github.com/YU06118/jianji/releases/latest/download/latest.json";
/// 镜像源（腾讯 COS）开通后填入，如 "https://<bucket>.cos.ap-guangzhou.myqcloud.com/latest.json"
const MIRROR_ENDPOINT: Option<&str> = None;

/// 按下载源检查新版本。source：None/"auto"=conf 双源依次尝试；"official"=仅 GitHub；"mirror"=仅镜像。
/// 返回 None 表示已是最新。
#[derive(serde::Serialize)]
struct UpdateMeta {
    version: String,
    notes: Option<String>,
    current_version: String,
}

#[tauri::command]
async fn updater_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdaterState>,
    source: Option<String>,
) -> Result<Option<UpdateMeta>, String> {
    let mut builder = app.updater_builder();
    match source.as_deref() {
        Some("official") => {
            builder = builder.endpoints(vec![OFFICIAL_ENDPOINT.parse().map_err(|e| format!("endpoint url: {e}"))?]).map_err(|e| e.to_string())?;
        }
        Some("mirror") => {
            match MIRROR_ENDPOINT {
                Some(ep) => {
                    builder = builder.endpoints(vec![ep.parse().map_err(|e| format!("endpoint url: {e}"))?]).map_err(|e| e.to_string())?;
                }
                None => return Err("镜像源尚未配置，当前可使用「自动」或「官方」源".into()),
            }
        }
        _ => { /* auto：使用 conf 内配置的双源 */ }
    }
    let update = builder.build().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    match update {
        Some(u) => {
            let meta = UpdateMeta {
                version: u.version.clone(),
                notes: u.body.clone(),
                current_version: u.current_version.clone(),
            };
            *state.pending.lock().map_err(|e| e.to_string())? = Some(u);
            Ok(Some(meta))
        }
        None => Ok(None),
    }
}

/// 下载并安装暂存的新版本（passive 静默安装），进度经 updater://progress 事件推送。
#[tauri::command]
async fn updater_download_install(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdaterState>,
) -> Result<(), String> {
    let update = state
        .pending
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("请先执行检查更新")?;
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = app.emit("updater://progress", serde_json::json!({
                    "downloaded": downloaded,
                    "total": total,
                }));
            },
            || { /* 下载完成；install 由插件接管并自动退出应用 */ },
        )
        .await
        .map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let appdata = app.path().app_data_dir().expect("app data dir");
            fs::create_dir_all(&appdata).expect("create app data dir");
            fs::create_dir_all(db::images_dir(&appdata)).expect("create images dir");
            let conn = Connection::open(db::db_path(&appdata)).expect("open sqlite");
            db::init(&conn).expect("init db");
            app.manage(AppState { conn: Mutex::new(conn), appdata });
            app.manage(UpdaterState { pending: Mutex::new(None) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_records, save_record, trash_record, purge_trash,
            list_categories, save_category, delete_category,
            get_setting, set_setting,
            export_backup, import_backup, save_backup_to,
            save_image, data_dir,
            updater_check, updater_download_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running 简记");
}
