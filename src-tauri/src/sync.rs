use crate::db::{self, Db};
use crate::google::{self, ApiError, API};
use crate::models::SyncResult;
use chrono::{DateTime, Duration, Local, NaiveDate};
use reqwest::Method;
use rusqlite::params;
use serde_json::{json, Value};

/// Uygulamanin yetkili renk paleti. Google'dan gelen rastgele hex degerleri
/// buna oturtulur: ekranda iki komsu mavi degil, birbirinden ayrilan aileler
/// olsun (okul / kisisel / takip ayrimi lejant okumadan gorulmeli).
const PALET: [(&str, u8, u8, u8); 10] = [
    ("#ff6a3d", 0xff, 0x6a, 0x3d), // kor
    ("#f0a03c", 0xf0, 0xa0, 0x3c), // kehribar
    ("#d6c24c", 0xd6, 0xc2, 0x4c), // limon
    ("#7db86e", 0x7d, 0xb8, 0x6e), // yesil
    ("#4fb6a8", 0x4f, 0xb6, 0xa8), // camgobegi
    ("#58a8ea", 0x58, 0xa8, 0xea), // gok
    ("#7f8cf2", 0x7f, 0x8c, 0xf2), // civit
    ("#a87cea", 0xa8, 0x7c, 0xea), // mor
    ("#ea71a2", 0xea, 0x71, 0xa2), // gul
    ("#bc8568", 0xbc, 0x85, 0x68), // kil
];

/// Gelen hex'i palette en yakin renge yaslar; cozulemezse ilk renge duser.
fn palete_yasla(hex: &str) -> &'static str {
    let h = hex.trim_start_matches('#');
    let bilesen = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok();
    let (r, g, b) = match (h.len() == 6, bilesen(0), bilesen(2), bilesen(4)) {
        (true, Some(r), Some(g), Some(b)) => (r as i32, g as i32, b as i32),
        _ => return PALET[0].0,
    };
    PALET
        .iter()
        .min_by_key(|(_, pr, pg, pb)| {
            let (dr, dg, db) = (r - *pr as i32, g - *pg as i32, b - *pb as i32);
            // Goz yesile daha duyarli; agirlikli kare mesafe daha iyi eslesiyor.
            2 * dr * dr + 4 * dg * dg + 3 * db * db
        })
        .map(|(ad, ..)| *ad)
        .unwrap_or(PALET[0].0)
}

fn tz_name(db: &Db) -> String {
    db.lock()
        .ok()
        .and_then(|c| db::get_setting(&c, "time_zone"))
        .unwrap_or_else(|| "Europe/Istanbul".to_string())
}

// --------------------------------------------------------- tarih cevrimleri

/// Google'in tum gun bitisi *dislayicidir*; bizde son gunun kendisi tutulur.
fn plus_one_day(date: &str) -> String {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|d| (d + Duration::days(1)).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| date.to_string())
}

fn minus_one_day(date: &str) -> String {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|d| (d - Duration::days(1)).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| date.to_string())
}

fn to_local_rfc3339(s: &str) -> String {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Local).to_rfc3339())
        .unwrap_or_else(|_| s.to_string())
}

/// Google `start` / `end` nesnesinden (tarih, tum_gun_mu) cikarir.
fn read_time(node: &Value, is_end: bool) -> Option<(String, bool)> {
    if let Some(d) = node.get("date").and_then(|v| v.as_str()) {
        let val = if is_end { minus_one_day(d) } else { d.to_string() };
        return Some((val, true));
    }
    node.get("dateTime")
        .and_then(|v| v.as_str())
        .map(|s| (to_local_rfc3339(s), false))
}

fn write_time(value: &str, all_day: bool, is_end: bool, tz: &str) -> Value {
    if all_day {
        let d = if is_end { plus_one_day(value) } else { value.to_string() };
        json!({ "date": d })
    } else {
        json!({ "dateTime": value, "timeZone": tz })
    }
}

// ------------------------------------------------------------- takvim listesi

async fn pull_calendar_list(db: &Db, token: &str) -> Result<usize, String> {
    let body = google::request(
        token,
        Method::GET,
        &format!("{API}/users/me/calendarList?maxResults=250"),
        None,
    )
    .await
    .map_err(|e| format!("takvim listesi alinamadi: {e}"))?;

    let items = body["items"].as_array().cloned().unwrap_or_default();
    let conn = db.lock().map_err(|_| "veritabani kilidi")?;
    let mut seen = vec!["local".to_string()];
    let mut n = 0usize;

    for (i, it) in items.iter().enumerate() {
        let id = match it["id"].as_str() {
            Some(v) => v.to_string(),
            None => continue,
        };
        if it["deleted"].as_bool().unwrap_or(false) {
            continue;
        }
        let summary = it["summaryOverride"]
            .as_str()
            .or_else(|| it["summary"].as_str())
            .unwrap_or("(isimsiz)")
            .to_string();
        let color = palete_yasla(it["backgroundColor"].as_str().unwrap_or("#ff6a3d")).to_string();
        let primary = it["primary"].as_bool().unwrap_or(false) as i64;
        let role = it["accessRole"].as_str().unwrap_or("reader").to_string();
        let tz = it["timeZone"].as_str().map(|s| s.to_string());

        // Renk ve gorunurluk kullanicinin yerel tercihi; varsa ezilmez.
        conn.execute(
            "INSERT INTO calendars (id, summary, description, color, is_primary, access_role,
                                    visible, is_local, time_zone, sort_order, deleted)
             VALUES (?1,?2,?3,?4,?5,?6,1,0,?7,?8,0)
             ON CONFLICT(id) DO UPDATE SET
                summary = excluded.summary,
                description = excluded.description,
                is_primary = excluded.is_primary,
                access_role = excluded.access_role,
                time_zone = excluded.time_zone,
                sort_order = excluded.sort_order,
                deleted = 0",
            params![
                id,
                summary,
                it["description"].as_str(),
                color,
                primary,
                role,
                tz,
                i as i64
            ],
        )
        .map_err(|e| e.to_string())?;
        seen.push(id);
        n += 1;
    }

    // Google'da artik olmayan takvimler gizlenir (kayitlari silinmez).
    let placeholders = seen.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "UPDATE calendars SET deleted = 1 WHERE is_local = 0 AND id NOT IN ({placeholders})"
    );
    let refs: Vec<&dyn rusqlite::ToSql> =
        seen.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    conn.execute(&sql, refs.as_slice()).map_err(|e| e.to_string())?;
    Ok(n)
}

// ------------------------------------------------------------------- gonderim

fn event_payload(row: &EventRow, tz: &str) -> Value {
    let mut body = json!({
        "summary": row.title,
        "start": write_time(&row.start_at, row.all_day, false, tz),
        "end":   write_time(&row.end_at,   row.all_day, true,  tz),
    });
    body["description"] = row
        .description
        .clone()
        .map(Value::String)
        .unwrap_or(Value::Null);
    body["location"] = row.location.clone().map(Value::String).unwrap_or(Value::Null);

    if let Some(rr) = &row.rrule {
        if !rr.trim().is_empty() {
            let line = if rr.starts_with("RRULE:") {
                rr.clone()
            } else {
                format!("RRULE:{rr}")
            };
            body["recurrence"] = json!([line]);
        }
    } else {
        body["recurrence"] = json!([]);
    }

    body["reminders"] = match row.reminder_min {
        Some(m) if m >= 0 => json!({
            "useDefault": false,
            "overrides": [{ "method": "popup", "minutes": m }]
        }),
        _ => json!({ "useDefault": false, "overrides": [] }),
    };
    body
}

struct EventRow {
    id: String,
    calendar_id: String,
    google_id: Option<String>,
    title: String,
    description: Option<String>,
    location: Option<String>,
    start_at: String,
    end_at: String,
    all_day: bool,
    rrule: Option<String>,
    reminder_min: Option<i64>,
    deleted: bool,
}

fn dirty_rows(db: &Db) -> Result<Vec<EventRow>, String> {
    let conn = db.lock().map_err(|_| "veritabani kilidi")?;
    let mut st = conn
        .prepare(
            "SELECT e.* FROM events e
             JOIN calendars c ON c.id = e.calendar_id
             WHERE e.dirty = 1 AND c.is_local = 0
             ORDER BY e.updated_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([], |r| {
            Ok(EventRow {
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
                reminder_min: r.get("reminder_min")?,
                deleted: r.get::<_, i64>("deleted")? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

async fn push_changes(db: &Db, token: &str, out: &mut SyncResult) -> Result<(), String> {
    let tz = tz_name(db);
    for row in dirty_rows(db)? {
        let cal = urlencoding::encode(&row.calendar_id).into_owned();

        if row.deleted {
            let gid = match &row.google_id {
                Some(g) => urlencoding::encode(g).into_owned(),
                None => continue,
            };
            let url = format!("{API}/calendars/{cal}/events/{gid}");
            match google::request(token, Method::DELETE, &url, None).await {
                // 404/410: uzak tarafta zaten yok, yerelden de dusur.
                Ok(_) => {}
                Err(ApiError { status: 404, .. }) | Err(ApiError { status: 410, .. }) => {}
                Err(e) => {
                    out.errors.push(format!("{}: silinemedi — {e}", row.title));
                    continue;
                }
            }
            let conn = db.lock().map_err(|_| "veritabani kilidi")?;
            conn.execute("DELETE FROM events WHERE id = ?1", params![row.id])
                .map_err(|e| e.to_string())?;
            out.deleted += 1;
            continue;
        }

        let payload = event_payload(&row, &tz);
        let result = match &row.google_id {
            Some(g) => {
                let gid = urlencoding::encode(g).into_owned();
                let url = format!("{API}/calendars/{cal}/events/{gid}");
                match google::request(token, Method::PUT, &url, Some(payload.clone())).await {
                    // Uzakta silinmisse yeniden olustur.
                    Err(ApiError { status: 404, .. }) | Err(ApiError { status: 410, .. }) => {
                        let url = format!("{API}/calendars/{cal}/events");
                        google::request(token, Method::POST, &url, Some(payload)).await
                    }
                    other => other,
                }
            }
            None => {
                let url = format!("{API}/calendars/{cal}/events");
                google::request(token, Method::POST, &url, Some(payload)).await
            }
        };

        match result {
            Ok(v) => {
                let gid = v["id"].as_str().unwrap_or_default().to_string();
                let etag = v["etag"].as_str().unwrap_or_default().to_string();
                let conn = db.lock().map_err(|_| "veritabani kilidi")?;
                conn.execute(
                    "UPDATE events SET google_id = ?2, etag = ?3, dirty = 0 WHERE id = ?1",
                    params![row.id, gid, etag],
                )
                .map_err(|e| e.to_string())?;
                out.pushed += 1;
            }
            Err(e) => out.errors.push(format!("{}: gonderilemedi — {e}", row.title)),
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------- cekme

fn upsert_remote(db: &Db, cal_id: &str, item: &Value) -> Result<bool, String> {
    let gid = match item["id"].as_str() {
        Some(v) => v.to_string(),
        None => return Ok(false),
    };
    let status = item["status"].as_str().unwrap_or("confirmed").to_string();
    let recurring_id = item["recurringEventId"].as_str().map(|s| s.to_string());
    let original_start = item
        .get("originalStartTime")
        .and_then(|n| read_time(n, false))
        .map(|(v, _)| v);

    let conn = db.lock().map_err(|_| "veritabani kilidi")?;

    if status == "cancelled" {
        if recurring_id.is_some() {
            // Tekrarin tek bir gunu iptal edilmis: arayuz atlasin diye sakla.
            conn.execute(
                "INSERT INTO events (id, calendar_id, google_id, title, start_at, end_at,
                                     status, recurring_event_id, original_start, updated_at, dirty)
                 VALUES (?1,?2,?3,'',?4,?4,'cancelled',?5,?4,?6,0)
                 ON CONFLICT(calendar_id, google_id) DO UPDATE SET
                    status = 'cancelled', recurring_event_id = excluded.recurring_event_id,
                    original_start = excluded.original_start, dirty = 0",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    cal_id,
                    gid,
                    original_start.clone().unwrap_or_default(),
                    recurring_id,
                    db::now_ms()
                ],
            )
            .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "DELETE FROM events WHERE calendar_id = ?1 AND google_id = ?2",
                params![cal_id, gid],
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(true);
    }

    let (start_at, all_day) = match read_time(&item["start"], false) {
        Some(v) => v,
        None => return Ok(false),
    };
    let (end_at, _) = read_time(&item["end"], true).unwrap_or((start_at.clone(), all_day));

    let rrule = item["recurrence"]
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .find(|s| s.starts_with("RRULE:"))
        })
        .map(|s| s.to_string());

    let reminder_min = item
        .get("reminders")
        .and_then(|r| r.get("overrides"))
        .and_then(|o| o.as_array())
        .and_then(|arr| arr.first())
        .and_then(|o| o.get("minutes"))
        .and_then(|m| m.as_i64());

    conn.execute(
        "INSERT INTO events (id, calendar_id, google_id, etag, title, description, location,
                             start_at, end_at, all_day, rrule, reminder_min, status,
                             recurring_event_id, original_start, updated_at, dirty, deleted)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,0,0)
         ON CONFLICT(calendar_id, google_id) DO UPDATE SET
            etag = excluded.etag, title = excluded.title,
            description = excluded.description, location = excluded.location,
            start_at = excluded.start_at, end_at = excluded.end_at,
            all_day = excluded.all_day, rrule = excluded.rrule,
            reminder_min = excluded.reminder_min, status = excluded.status,
            recurring_event_id = excluded.recurring_event_id,
            original_start = excluded.original_start,
            updated_at = excluded.updated_at, dirty = 0, deleted = 0",
        params![
            uuid::Uuid::new_v4().to_string(),
            cal_id,
            gid,
            item["etag"].as_str().unwrap_or_default(),
            item["summary"].as_str().unwrap_or("(basliksiz)"),
            item["description"].as_str(),
            item["location"].as_str(),
            start_at,
            end_at,
            all_day as i64,
            rrule,
            reminder_min,
            status,
            recurring_id,
            original_start,
            db::now_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(true)
}

async fn pull_calendar(db: &Db, token: &str, cal_id: &str, out: &mut SyncResult) {
    let mut sync_token = {
        match db.lock() {
            Ok(c) => c
                .query_row(
                    "SELECT sync_token FROM calendars WHERE id = ?1",
                    params![cal_id],
                    |r| r.get::<_, Option<String>>(0),
                )
                .unwrap_or(None),
            Err(_) => None,
        }
    };
    let cal = urlencoding::encode(cal_id).into_owned();
    let mut page: Option<String> = None;
    let mut retried_full = false;

    loop {
        let mut url = format!(
            "{API}/calendars/{cal}/events?maxResults=2500&showDeleted=true&singleEvents=false"
        );
        if let Some(t) = &sync_token {
            url.push_str(&format!("&syncToken={}", urlencoding::encode(t)));
        }
        if let Some(p) = &page {
            url.push_str(&format!("&pageToken={}", urlencoding::encode(p)));
        }

        let body = match google::request(token, Method::GET, &url, None).await {
            Ok(v) => v,
            Err(ApiError { status: 410, .. }) if !retried_full => {
                // Senkron simgesi eskimis: sifirdan tam cekim.
                retried_full = true;
                sync_token = None;
                page = None;
                if let Ok(c) = db.lock() {
                    let _ = c.execute(
                        "UPDATE calendars SET sync_token = NULL WHERE id = ?1",
                        params![cal_id],
                    );
                }
                continue;
            }
            Err(e) => {
                out.errors.push(format!("{cal_id}: cekilemedi — {e}"));
                return;
            }
        };

        for item in body["items"].as_array().cloned().unwrap_or_default() {
            match upsert_remote(db, cal_id, &item) {
                Ok(true) => out.pulled += 1,
                Ok(false) => {}
                Err(e) => out.errors.push(format!("{cal_id}: {e}")),
            }
        }

        if let Some(next) = body["nextPageToken"].as_str() {
            page = Some(next.to_string());
            continue;
        }
        if let Some(next_sync) = body["nextSyncToken"].as_str() {
            if let Ok(c) = db.lock() {
                let _ = c.execute(
                    "UPDATE calendars SET sync_token = ?2 WHERE id = ?1",
                    params![cal_id, next_sync],
                );
            }
        }
        return;
    }
}

// ---------------------------------------------------------------------- akis

pub async fn run(db: &Db) -> Result<SyncResult, String> {
    let token = google::access_token(db).await?;
    let mut out = SyncResult::default();

    out.calendars = pull_calendar_list(db, &token).await.unwrap_or(0);

    // Once gonder, sonra cek: kendi degisikligimiz uzak taraftan geri gelsin,
    // etag ve google_id ayni turda oturmus olsun.
    push_changes(db, &token, &mut out).await?;

    let ids: Vec<String> = {
        let conn = db.lock().map_err(|_| "veritabani kilidi")?;
        let mut st = conn
            .prepare("SELECT id FROM calendars WHERE is_local = 0 AND deleted = 0")
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.filter_map(Result::ok).collect()
    };
    for id in ids {
        pull_calendar(db, &token, &id, &mut out).await;
    }

    out.at = db::now_ms();
    if let Ok(conn) = db.lock() {
        db::set_setting(&conn, "last_sync", &out.at.to_string()).ok();
    }
    Ok(out)
}

/// Cok eskimis iptal istisnalarini budar; bunlar sadece bir tekrari
/// atlatmak icin duruyor, gecmise dogru sonsuza kadar birikmelerine gerek yok.
pub fn prune(db: &Db) {
    if let Ok(conn) = db.lock() {
        let cutoff = (Local::now() - Duration::days(400))
            .format("%Y-%m-%d")
            .to_string();
        let _ = conn.execute(
            "DELETE FROM events WHERE status = 'cancelled' AND original_start < ?1",
            params![cutoff],
        );
    }
}
