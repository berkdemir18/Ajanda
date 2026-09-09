use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Calendar {
    pub id: String,
    pub summary: String,
    pub description: Option<String>,
    pub color: String,
    pub is_primary: bool,
    pub access_role: String,
    pub visible: bool,
    pub is_local: bool,
    pub time_zone: Option<String>,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub calendar_id: String,
    pub google_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    /// Zamanli olaylarda RFC3339 ("2026-09-08T15:00:00+03:00"),
    /// tum gun olaylarda "YYYY-MM-DD".
    pub start_at: String,
    /// Tum gun olaylarda bitis *dislayici* degildir: son gunun kendisidir
    /// (Google'in exclusive bitisine cevrim db katmaninda yapilir).
    pub end_at: String,
    pub all_day: bool,
    pub rrule: Option<String>,
    pub color: Option<String>,
    pub reminder_min: Option<i64>,
    pub status: String,
    pub recurring_event_id: Option<String>,
    pub original_start: Option<String>,
    pub done: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventInput {
    pub id: Option<String>,
    pub calendar_id: String,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start_at: String,
    pub end_at: String,
    pub all_day: bool,
    pub rrule: Option<String>,
    pub color: Option<String>,
    pub reminder_min: Option<i64>,
    pub done: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub pushed: usize,
    pub pulled: usize,
    pub deleted: usize,
    pub calendars: usize,
    pub errors: Vec<String>,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub connected: bool,
    pub email: Option<String>,
    pub has_client: bool,
    pub last_sync: Option<i64>,
    pub pending: usize,
}
