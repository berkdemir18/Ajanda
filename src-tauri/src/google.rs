use crate::db::{self, Db};
use base64::Engine;
use rand::Rng;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

pub const SCOPES: &str = "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
pub const API: &str = "https://www.googleapis.com/calendar/v3";

pub const K_CLIENT_ID: &str = "google_client_id";
pub const K_CLIENT_SECRET: &str = "google_client_secret";
pub const K_REFRESH: &str = "google_refresh_token";
pub const K_ACCESS: &str = "google_access_token";
pub const K_EXPIRES: &str = "google_token_expires";
pub const K_EMAIL: &str = "google_email";

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn random_string(n: usize) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let mut rng = rand::thread_rng();
    (0..n)
        .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
        .collect()
}

fn enc(s: &str) -> String {
    urlencoding::encode(s).into_owned()
}

/// Tarayicidan donen kodu yakalayan tek seferlik yerel dinleyici.
/// Google masaustu istemcileri icin loopback yeniden yonlendirme sarti.
fn wait_for_code(listener: TcpListener, state: &str) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("dinleyici ayarlanamadi: {e}"))?;
    let deadline = Instant::now() + Duration::from_secs(240);

    while Instant::now() < deadline {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(false).ok();
                let mut line = String::new();
                let mut reader = BufReader::new(
                    stream.try_clone().map_err(|e| format!("akis hatasi: {e}"))?,
                );
                reader
                    .read_line(&mut line)
                    .map_err(|e| format!("istek okunamadi: {e}"))?;

                // "GET /?code=...&state=... HTTP/1.1"
                let path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
                let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
                let mut code = None;
                let mut got_state = None;
                let mut err = None;
                for pair in query.split('&') {
                    let (k, v) = match pair.split_once('=') {
                        Some(kv) => kv,
                        None => continue,
                    };
                    let v = percent_encoding::percent_decode_str(v)
                        .decode_utf8_lossy()
                        .replace('+', " ");
                    match k {
                        "code" => code = Some(v),
                        "state" => got_state = Some(v),
                        "error" => err = Some(v),
                        _ => {}
                    }
                }

                let ok = code.is_some() && got_state.as_deref() == Some(state);
                let body = if ok {
                    "<!doctype html><meta charset=utf-8><title>Ajanda</title>\
                     <body style=\"font-family:system-ui;background:#0d0e12;color:#e8eaf0;\
                     display:grid;place-items:center;height:100vh;margin:0\">\
                     <div style=\"text-align:center\"><div style=\"font-size:44px\">&#128197;</div>\
                     <h2>Google hesabi baglandi</h2><p style=\"opacity:.6\">Bu sekmeyi kapatip \
                     Ajanda uygulamasina donebilirsin.</p></div>"
                } else {
                    "<!doctype html><meta charset=utf-8><title>Ajanda</title>\
                     <body style=\"font-family:system-ui;background:#0d0e12;color:#e8eaf0;\
                     display:grid;place-items:center;height:100vh;margin:0\">\
                     <div style=\"text-align:center\"><h2>Baglanti iptal edildi</h2>\
                     <p style=\"opacity:.6\">Uygulamaya donup tekrar deneyebilirsin.</p></div>"
                };
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\
                     Content-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();

                if let Some(e) = err {
                    return Err(format!("Google izni reddedildi: {e}"));
                }
                if got_state.as_deref() != Some(state) {
                    return Err("guvenlik dogrulamasi (state) tutmadi".into());
                }
                return code.ok_or_else(|| "Google kod dondurmedi".to_string());
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(120));
            }
            Err(e) => return Err(format!("baglanti hatasi: {e}")),
        }
    }
    Err("zaman asimi — tarayicida izin verilmedi".into())
}

pub struct Tokens {
    pub access: String,
    pub refresh: Option<String>,
    pub expires_in: i64,
}

async fn post_token(form: Vec<(&str, String)>) -> Result<Tokens, String> {
    let client = reqwest::Client::new();
    let res = client
        .post(TOKEN_URL)
        .form(&form)
        .send()
        .await
        .map_err(|e| format!("token istegi basarisiz: {e}"))?;
    let status = res.status();
    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("token yaniti okunamadi: {e}"))?;
    if !status.is_success() {
        let desc = body
            .get("error_description")
            .and_then(|v| v.as_str())
            .or_else(|| body.get("error").and_then(|v| v.as_str()))
            .unwrap_or("bilinmeyen hata");
        return Err(format!("Google token hatasi ({status}): {desc}"));
    }
    Ok(Tokens {
        access: body["access_token"].as_str().unwrap_or_default().to_string(),
        refresh: body
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        expires_in: body
            .get("expires_in")
            .and_then(|v| v.as_i64())
            .unwrap_or(3600),
    })
}

/// Tam yetkilendirme akisi: tarayici acilir, kullanici izin verir,
/// loopback'e dusen kod refresh token'a takas edilir.
pub async fn interactive_login(db: &Db) -> Result<String, String> {
    let (client_id, client_secret) = {
        let conn = db.lock().map_err(|_| "veritabani kilidi")?;
        (
            db::get_setting(&conn, K_CLIENT_ID).unwrap_or_default(),
            db::get_setting(&conn, K_CLIENT_SECRET).unwrap_or_default(),
        )
    };
    if client_id.trim().is_empty() {
        return Err("Once Ayarlar'dan Google istemci kimligini gir.".into());
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("yerel port acilamadi: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("port okunamadi: {e}"))?
        .port();
    let redirect = format!("http://127.0.0.1:{port}");

    let verifier = random_string(64);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let state = random_string(24);

    let url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}\
         &access_type=offline&prompt=consent&code_challenge={}&code_challenge_method=S256&state={}",
        enc(&client_id),
        enc(&redirect),
        enc(SCOPES),
        enc(&challenge),
        enc(&state),
    );

    tauri_plugin_opener::open_url(url, None::<&str>)
        .map_err(|e| format!("tarayici acilamadi: {e}"))?;

    let state_for_thread = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || {
        wait_for_code(listener, &state_for_thread)
    })
    .await
    .map_err(|e| format!("dinleyici coktu: {e}"))??;

    let mut form = vec![
        ("client_id", client_id.clone()),
        ("code", code),
        ("code_verifier", verifier),
        ("grant_type", "authorization_code".to_string()),
        ("redirect_uri", redirect),
    ];
    if !client_secret.trim().is_empty() {
        form.push(("client_secret", client_secret.clone()));
    }
    let tokens = post_token(form).await?;

    let refresh = tokens
        .refresh
        .ok_or("Google yenileme anahtari vermedi — izni kaldirip tekrar dene")?;
    let email = fetch_email(&tokens.access).await.unwrap_or_default();
    let exp = chrono::Utc::now().timestamp() + tokens.expires_in - 60;

    {
        let conn = db.lock().map_err(|_| "veritabani kilidi")?;
        db::set_setting(&conn, K_REFRESH, &refresh).ok();
        db::set_setting(&conn, K_ACCESS, &tokens.access).ok();
        db::set_setting(&conn, K_EXPIRES, &exp.to_string()).ok();
        if !email.is_empty() {
            db::set_setting(&conn, K_EMAIL, &email).ok();
        }
    }
    Ok(email)
}

async fn fetch_email(access: &str) -> Option<String> {
    let client = reqwest::Client::new();
    let res = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access)
        .send()
        .await
        .ok()?;
    let body: serde_json::Value = res.json().await.ok()?;
    body.get("email")?.as_str().map(|s| s.to_string())
}

/// Gecerli erisim anahtari; suresi dolduysa sessizce yeniler.
pub async fn access_token(db: &Db) -> Result<String, String> {
    let (access, exp, refresh, client_id, client_secret) = {
        let conn = db.lock().map_err(|_| "veritabani kilidi")?;
        (
            db::get_setting(&conn, K_ACCESS),
            db::get_setting(&conn, K_EXPIRES)
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0),
            db::get_setting(&conn, K_REFRESH),
            db::get_setting(&conn, K_CLIENT_ID).unwrap_or_default(),
            db::get_setting(&conn, K_CLIENT_SECRET).unwrap_or_default(),
        )
    };

    if let Some(a) = access {
        if !a.is_empty() && chrono::Utc::now().timestamp() < exp {
            return Ok(a);
        }
    }
    let refresh = refresh.ok_or("Google hesabi bagli degil")?;

    let mut form = vec![
        ("client_id", client_id),
        ("refresh_token", refresh),
        ("grant_type", "refresh_token".to_string()),
    ];
    if !client_secret.trim().is_empty() {
        form.push(("client_secret", client_secret));
    }
    let tokens = post_token(form).await?;
    let new_exp = chrono::Utc::now().timestamp() + tokens.expires_in - 60;
    {
        let conn = db.lock().map_err(|_| "veritabani kilidi")?;
        db::set_setting(&conn, K_ACCESS, &tokens.access).ok();
        db::set_setting(&conn, K_EXPIRES, &new_exp.to_string()).ok();
    }
    Ok(tokens.access)
}

pub fn logout(db: &Db) -> Result<(), String> {
    let conn = db.lock().map_err(|_| "veritabani kilidi")?;
    for k in [K_REFRESH, K_ACCESS, K_EXPIRES, K_EMAIL] {
        db::del_setting(&conn, k).ok();
    }
    // Senkron simgeleri de gecersiz; bir sonraki baglantida sifirdan cekilir.
    conn.execute("UPDATE calendars SET sync_token = NULL", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub struct ApiError {
    pub status: u16,
    pub message: String,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.message, self.status)
    }
}

pub async fn request(
    token: &str,
    method: reqwest::Method,
    url: &str,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, ApiError> {
    let client = reqwest::Client::new();
    let mut req = client.request(method, url).bearer_auth(token);
    if let Some(b) = body {
        req = req.json(&b);
    }
    let res = req.send().await.map_err(|e| ApiError {
        status: 0,
        message: format!("ag hatasi: {e}"),
    })?;
    let status = res.status().as_u16();
    let text = res.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        let msg = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| text.chars().take(200).collect());
        return Err(ApiError {
            status,
            message: msg,
        });
    }
    if text.trim().is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| ApiError {
        status,
        message: format!("yanit cozulemedi: {e}"),
    })
}
