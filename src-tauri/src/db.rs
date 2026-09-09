use crate::models::{Calendar, Event, EventInput};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::path::Path;

pub type Db = std::sync::Mutex<Connection>;

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    // File Finder'da WAL 3,9 GB'a cikip diski doldurmustu; bastan sinirla.
    conn.pragma_update(None, "journal_size_limit", 16 * 1024 * 1024)?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS settings (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS calendars (
            id           TEXT PRIMARY KEY,
            summary      TEXT NOT NULL,
            description  TEXT,
            color        TEXT NOT NULL DEFAULT '#ff6a3d',
            is_primary   INTEGER NOT NULL DEFAULT 0,
            access_role  TEXT NOT NULL DEFAULT 'owner',
            visible      INTEGER NOT NULL DEFAULT 1,
            is_local     INTEGER NOT NULL DEFAULT 0,
            time_zone    TEXT,
            sync_token   TEXT,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            deleted      INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS events (
            id                  TEXT PRIMARY KEY,
            calendar_id         TEXT NOT NULL,
            google_id           TEXT,
            etag                TEXT,
            title               TEXT NOT NULL DEFAULT '',
            description         TEXT,
            location            TEXT,
            start_at            TEXT NOT NULL,
            end_at              TEXT NOT NULL,
            all_day             INTEGER NOT NULL DEFAULT 0,
            rrule               TEXT,
            color               TEXT,
            reminder_min        INTEGER,
            status              TEXT NOT NULL DEFAULT 'confirmed',
            recurring_event_id  TEXT,
            original_start      TEXT,
            done                INTEGER NOT NULL DEFAULT 0,
            updated_at          INTEGER NOT NULL,
            dirty               INTEGER NOT NULL DEFAULT 0,
            deleted             INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_events_start  ON events(start_at);
        CREATE INDEX IF NOT EXISTS idx_events_dirty  ON events(dirty);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_events_gid_uniq
            ON events(calendar_id, google_id) WHERE google_id IS NOT NULL;
        "#,
    )?;

    // Cevrimdisi da calisabilmesi icin daima bir yerel takvim bulunur.
    let has_local: i64 = conn.query_row(
        "SELECT COUNT(*) FROM calendars WHERE is_local = 1",
        [],
        |r| r.get(0),
    )?;
    if has_local == 0 {
        conn.execute(
            "INSERT INTO calendars (id, summary, color, is_primary, access_role, visible, is_local, sort_order)
             VALUES ('local', 'Yerel Takvim', '#a87cea', 0, 'owner', 1, 1, 100)",
            [],
        )?;
    }
    Ok(())
}

// ---------------------------------------------------------------- ayarlar

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT v FROM settings WHERE k = ?1", params![key], |r| {
        r.get::<_, String>(0)
    })
    .optional()
    .ok()
    .flatten()
}

pub fn set_setting(conn: &Connection, key: &str, val: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (k, v) VALUES (?1, ?2)
         ON CONFLICT(k) DO UPDATE SET v = excluded.v",
        params![key, val],
    )?;
    Ok(())
}

pub fn del_setting(conn: &Connection, key: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM settings WHERE k = ?1", params![key])?;
    Ok(())
}

// -------------------------------------------------------------- takvimler

fn calendar_from_row(r: &Row) -> rusqlite::Result<Calendar> {
    Ok(Calendar {
        id: r.get("id")?,
        summary: r.get("summary")?,
        description: r.get("description")?,
        color: r.get("color")?,
        is_primary: r.get::<_, i64>("is_primary")? != 0,
        access_role: r.get("access_role")?,
        visible: r.get::<_, i64>("visible")? != 0,
        is_local: r.get::<_, i64>("is_local")? != 0,
        time_zone: r.get("time_zone")?,
        sort_order: r.get("sort_order")?,
    })
}

pub fn calendars(conn: &Connection) -> rusqlite::Result<Vec<Calendar>> {
    let mut st = conn.prepare(
        "SELECT * FROM calendars WHERE deleted = 0
         ORDER BY is_primary DESC, sort_order ASC, summary COLLATE NOCASE ASC",
    )?;
    let rows = st.query_map([], calendar_from_row)?;
    rows.collect()
}

pub fn set_calendar_visible(conn: &Connection, id: &str, visible: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE calendars SET visible = ?2 WHERE id = ?1",
        params![id, visible as i64],
    )?;
    Ok(())
}

pub fn set_calendar_color(conn: &Connection, id: &str, color: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE calendars SET color = ?2 WHERE id = ?1",
        params![id, color],
    )?;
    Ok(())
}

// --------------------------------------------------------------- olaylar

pub fn event_from_row(r: &Row) -> rusqlite::Result<Event> {
    Ok(Event {
        id: r.get("id")?,
        calendar_id: r.get("calendar_id")?,
        google_id: r.get("google_id")?,
        title: r.get("title")?,
        description: r.get("description")?,
        location: r.get("location")?,
        start_at: r.get("start_at")?,
        end_at: r.get("end_at")?,
        all_day: r.get::<_, i64>("all_day")? != 0,
        rrule: r.get("rrule")?,
        color: r.get("color")?,
        reminder_min: r.get("reminder_min")?,
        status: r.get("status")?,
        recurring_event_id: r.get("recurring_event_id")?,
        original_start: r.get("original_start")?,
        done: r.get::<_, i64>("done")? != 0,
        updated_at: r.get("updated_at")?,
    })
}

/// Tekrarli olaylarin ana kaydi ve istisnalari aralik disinda da olsa daima
/// dondurulur; genisletmeyi arayuz yapar (RRULE iki yerde yorumlanmasin diye).
pub fn events_in_range(conn: &Connection, min: &str, max: &str) -> rusqlite::Result<Vec<Event>> {
    let mut st = conn.prepare(
        "SELECT * FROM events
         WHERE deleted = 0 AND status <> 'cancelled'
           AND ( rrule IS NOT NULL
                 OR recurring_event_id IS NOT NULL
                 -- Tum gun olaylarinda deger 'YYYY-MM-DD', zamanlilarda tam
                 -- RFC3339. Duz metin karsilastirmasi sinir gunundeki tum gun
                 -- olayini disarida birakiyordu; ikisini de gune indiriyoruz.
                 OR ( substr(end_at, 1, 10) >= substr(?1, 1, 10)
                      AND substr(start_at, 1, 10) <= substr(?2, 1, 10) ) )
         ORDER BY start_at ASC",
    )?;
    let rows = st.query_map(params![min, max], event_from_row)?;
    rows.collect()
}

/// Iptal edilmis tekrar istisnalari (arayuz o tekrari atlasin diye).
pub fn cancelled_exceptions(conn: &Connection) -> rusqlite::Result<Vec<(String, String)>> {
    let mut st = conn.prepare(
        "SELECT recurring_event_id, original_start FROM events
         WHERE recurring_event_id IS NOT NULL AND original_start IS NOT NULL
           AND (status = 'cancelled' OR deleted = 1)",
    )?;
    let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    rows.collect()
}

/// Arama icin tum kayitlar (tekrar ana kayitlari dahil).
pub fn all_events(conn: &Connection) -> rusqlite::Result<Vec<Event>> {
    let mut st = conn.prepare(
        "SELECT * FROM events WHERE deleted = 0 AND status <> 'cancelled' ORDER BY start_at ASC",
    )?;
    let rows = st.query_map([], event_from_row)?;
    rows.collect()
}

pub fn get_event(conn: &Connection, id: &str) -> rusqlite::Result<Option<Event>> {
    conn.query_row(
        "SELECT * FROM events WHERE id = ?1",
        params![id],
        event_from_row,
    )
    .optional()
}

pub fn save_event(conn: &Connection, input: &EventInput) -> rusqlite::Result<Event> {
    let now = now_ms();
    let id = match &input.id {
        Some(id) if !id.is_empty() => id.clone(),
        _ => uuid::Uuid::new_v4().to_string(),
    };
    let exists: bool = conn
        .query_row("SELECT 1 FROM events WHERE id = ?1", params![id], |_| Ok(()))
        .optional()?
        .is_some();

    if exists {
        conn.execute(
            "UPDATE events SET
                calendar_id = ?2, title = ?3, description = ?4, location = ?5,
                start_at = ?6, end_at = ?7, all_day = ?8, rrule = ?9, color = ?10,
                reminder_min = ?11, done = ?12, updated_at = ?13, dirty = 1, deleted = 0
             WHERE id = ?1",
            params![
                id,
                input.calendar_id,
                input.title,
                input.description,
                input.location,
                input.start_at,
                input.end_at,
                input.all_day as i64,
                input.rrule,
                input.color,
                input.reminder_min,
                input.done.unwrap_or(false) as i64,
                now
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO events
                (id, calendar_id, title, description, location, start_at, end_at,
                 all_day, rrule, color, reminder_min, done, updated_at, dirty, status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,1,'confirmed')",
            params![
                id,
                input.calendar_id,
                input.title,
                input.description,
                input.location,
                input.start_at,
                input.end_at,
                input.all_day as i64,
                input.rrule,
                input.color,
                input.reminder_min,
                input.done.unwrap_or(false) as i64,
                now
            ],
        )?;
    }
    get_event(conn, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

/// Google'a hic gonderilmemis kayit dogrudan silinir; gonderilmis olan
/// "silindi" isaretiyle kuyrukta bekler ki uzak tarafta da silinsin.
pub fn delete_event(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    let gid: Option<Option<String>> = conn
        .query_row(
            "SELECT google_id FROM events WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()?;
    match gid {
        Some(Some(_)) => {
            conn.execute(
                "UPDATE events SET deleted = 1, dirty = 1, updated_at = ?2 WHERE id = ?1",
                params![id, now_ms()],
            )?;
        }
        _ => {
            conn.execute("DELETE FROM events WHERE id = ?1", params![id])?;
        }
    }
    Ok(())
}

pub fn toggle_done(conn: &Connection, id: &str, done: bool) -> rusqlite::Result<()> {
    // "Yapildi" yerel bir isarettir; Google'da karsiligi yok, dirty yapmaz.
    conn.execute(
        "UPDATE events SET done = ?2 WHERE id = ?1",
        params![id, done as i64],
    )?;
    Ok(())
}

/// Google'a gonderilmeyi bekleyen kayit sayisi. Yerel takvimdekiler hicbir
/// zaman gonderilmedigi icin sayilmaz — yoksa rozet kalici olarak takili kalir.
pub fn pending_count(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COUNT(*) FROM events e
         JOIN calendars c ON c.id = e.calendar_id
         WHERE e.dirty = 1 AND c.is_local = 0",
        [],
        |r| r.get(0),
    )
    .unwrap_or(0)
}
