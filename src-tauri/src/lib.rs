mod db;
mod google;
mod models;
mod sync;

use db::Db;
use models::{AuthStatus, Calendar, Event, EventInput, SyncResult};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager, State};

// ------------------------------------------------------------- hatirlaticilar

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    /// occurrence anahtari: "<eventId>@<baslangic>" — ayni olayin iki tekrari
    /// birbirini bastirmasin diye.
    pub key: String,
    pub at: i64,
    pub title: String,
    pub body: String,
}

#[derive(Default)]
pub struct Reminders {
    pub items: Vec<Reminder>,
    pub fired: HashSet<String>,
}

pub struct AppState {
    pub db: Db,
    pub reminders: Mutex<Reminders>,
}

// -------------------------------------------------------------------- komutlar

#[tauri::command]
fn list_calendars(state: State<'_, AppState>) -> Result<Vec<Calendar>, String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    db::calendars(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_calendar_visible(
    state: State<'_, AppState>,
    id: String,
    visible: bool,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    db::set_calendar_visible(&conn, &id, visible).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_calendar_color(state: State<'_, AppState>, id: String, color: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    db::set_calendar_color(&conn, &id, &color).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RangePayload {
    events: Vec<Event>,
    cancelled: Vec<(String, String)>,
}

#[tauri::command]
fn events_range(
    state: State<'_, AppState>,
    min: String,
    max: String,
) -> Result<RangePayload, String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    Ok(RangePayload {
        events: db::events_in_range(&conn, &min, &max).map_err(|e| e.to_string())?,
        cancelled: db::cancelled_exceptions(&conn).map_err(|e| e.to_string())?,
    })
}

#[tauri::command]
fn all_events(state: State<'_, AppState>) -> Result<Vec<Event>, String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    db::all_events(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_event(state: State<'_, AppState>, input: EventInput) -> Result<Event, String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    db::save_event(&conn, &input).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_event(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    db::delete_event(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_done(state: State<'_, AppState>, id: String, done: bool) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    db::toggle_done(&conn, &id, done).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    let mut st = conn
        .prepare("SELECT k, v FROM settings")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut map = serde_json::Map::new();
    for row in rows.flatten() {
        // Gizli anahtarlar arayuze hic gitmez.
        if row.0 == google::K_REFRESH || row.0 == google::K_ACCESS {
            continue;
        }
        if row.0 == google::K_CLIENT_SECRET {
            map.insert("hasClientSecret".into(), serde_json::json!(!row.1.is_empty()));
            continue;
        }
        map.insert(row.0, serde_json::Value::String(row.1));
    }
    Ok(serde_json::Value::Object(map))
}

#[tauri::command]
fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn auth_status(state: State<'_, AppState>) -> Result<AuthStatus, String> {
    let conn = state.db.lock().map_err(|_| "veritabani kilidi")?;
    Ok(AuthStatus {
        connected: db::get_setting(&conn, google::K_REFRESH).is_some(),
        email: db::get_setting(&conn, google::K_EMAIL),
        has_client: db::get_setting(&conn, google::K_CLIENT_ID)
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false),
        last_sync: db::get_setting(&conn, "last_sync").and_then(|v| v.parse().ok()),
        pending: db::pending_count(&conn) as usize,
    })
}

#[tauri::command]
async fn auth_login(state: State<'_, AppState>) -> Result<String, String> {
    google::interactive_login(&state.db).await
}

#[tauri::command]
fn auth_logout(state: State<'_, AppState>) -> Result<(), String> {
    google::logout(&state.db)
}

#[tauri::command]
async fn sync_now(state: State<'_, AppState>) -> Result<SyncResult, String> {
    let out = sync::run(&state.db).await?;
    sync::prune(&state.db);
    Ok(out)
}

#[tauri::command]
fn set_reminders(state: State<'_, AppState>, items: Vec<Reminder>) -> Result<(), String> {
    let mut r = state.reminders.lock().map_err(|_| "hatirlatici kilidi")?;
    let live: HashSet<String> = items.iter().map(|i| i.key.clone()).collect();
    // Artik listede olmayanlarin "gonderildi" isareti dusurulur ki
    // olay ileri bir tarihe tasinirsa yeniden bildirilebilsin.
    r.fired.retain(|k| live.contains(k));
    r.items = items;
    Ok(())
}

#[tauri::command]
fn db_path(app: tauri::AppHandle) -> String {
    data_file(&app).to_string_lossy().to_string()
}

// ------------------------------------------------------------------- yardimci

fn data_file(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("ajanda.db")
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// ----------------------------------------------------------------- arka plan

fn spawn_reminder_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use tauri_plugin_notification::NotificationExt;
        loop {
            std::thread::sleep(Duration::from_secs(20));
            let now = chrono::Utc::now().timestamp_millis();
            let state = app.state::<AppState>();
            let due: Vec<Reminder> = match state.reminders.lock() {
                Ok(mut r) => {
                    let picked: Vec<Reminder> = r
                        .items
                        .iter()
                        .filter(|i| i.at <= now && i.at > now - 15 * 60 * 1000)
                        .filter(|i| !r.fired.contains(&i.key))
                        .cloned()
                        .collect();
                    for p in &picked {
                        r.fired.insert(p.key.clone());
                    }
                    picked
                }
                Err(_) => continue,
            };
            for d in due {
                let _ = app
                    .notification()
                    .builder()
                    .title(d.title)
                    .body(d.body)
                    .show();
            }
        }
    });
}

fn spawn_autosync(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Acilista biraz bekle: pencere cizilsin, ilk okuma tamamlansin.
        tokio_sleep(6).await;
        loop {
            let state = app.state::<AppState>();
            let (connected, interval) = {
                match state.db.lock() {
                    Ok(c) => (
                        db::get_setting(&c, google::K_REFRESH).is_some(),
                        db::get_setting(&c, "sync_interval_min")
                            .and_then(|v| v.parse::<u64>().ok())
                            .unwrap_or(5)
                            .clamp(1, 240),
                    ),
                    Err(_) => (false, 5),
                }
            };
            if connected {
                match sync::run(&state.db).await {
                    Ok(res) => {
                        let _ = app.emit("sync-done", &res);
                    }
                    Err(e) => {
                        let _ = app.emit("sync-error", e);
                    }
                }
            }
            tokio_sleep(interval * 60).await;
        }
    });
}

async fn tokio_sleep(secs: u64) {
    // tauri::async_runtime tokio uzerinde calisiyor; dogrudan sleep kullanmak
    // yerine spawn_blocking'e dusmemek icin timer'i burada topluyoruz.
    let _ = tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(Duration::from_secs(secs))
    })
    .await;
}

// ----------------------------------------------------------------------- run

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            list_calendars,
            set_calendar_visible,
            set_calendar_color,
            events_range,
            all_events,
            save_event,
            delete_event,
            toggle_done,
            get_settings,
            set_setting,
            auth_status,
            auth_login,
            auth_logout,
            sync_now,
            set_reminders,
            db_path,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let conn = db::open(&data_file(&handle)).expect("veritabani acilamadi");
            app.manage(AppState {
                db: Mutex::new(conn),
                reminders: Mutex::new(Reminders::default()),
            });

            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let open_i = MenuItem::with_id(app, "open", "Ajanda'yi ac", true, None::<&str>)?;
                let sync_i =
                    MenuItem::with_id(app, "sync", "Simdi senkronize et", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Cikis", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_i, &sync_i, &quit_i])?;

                TrayIconBuilder::with_id("ajanda-tray")
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Ajanda")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "open" => show_main(app),
                        "sync" => {
                            let app = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let state = app.state::<AppState>();
                                match sync::run(&state.db).await {
                                    Ok(res) => {
                                        let _ = app.emit("sync-done", &res);
                                    }
                                    Err(e) => {
                                        let _ = app.emit("sync-error", e);
                                    }
                                }
                            });
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }

            spawn_reminder_loop(handle.clone());
            spawn_autosync(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Kapatinca tepsiye insin: hatirlaticilar calismaya devam etsin.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("Ajanda baslatilamadi");
}
