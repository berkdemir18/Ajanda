import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../core/api";
import { ciz, senkronize, state, yukle } from "../core/store";
import { h } from "./dom";
import { ikon } from "./icons";
import { RENKLER } from "./editor";
import { tost } from "./toast";

const KURULUM = `1) console.cloud.google.com → yeni proje aç
2) "API'ler ve Hizmetler" → Kitaplık → Google Calendar API → Etkinleştir
3) OAuth izin ekranı → Harici → kendi e-postanı "Test kullanıcısı" olarak ekle
4) Kimlik bilgileri → OAuth istemci kimliği → tür: Masaüstü uygulaması
5) Çıkan İstemci Kimliği ve Gizli Anahtarı aşağıya yapıştır`;

export function ayarlar(): void {
  const perde = h("div", { sinif: "perde" });
  const kapat = () => {
    perde.remove();
    document.removeEventListener("keydown", tus);
  };
  const tus = (e: KeyboardEvent) => {
    if (e.key === "Escape") kapat();
  };

  const govde = h("div", { sinif: "kutu-govde" });

  const yenidenCiz = async () => {
    const [auth, ayar] = await Promise.all([api.authStatus(), api.settings()]);
    state.auth = auth;
    state.settings = ayar;
    govde.replaceChildren(...bolumler(auth, ayar, yenidenCiz));
  };

  const kutu = h(
    "div",
    { sinif: "kutu", onclick: (e: Event) => e.stopPropagation() },
    h(
      "div",
      { sinif: "kutu-ust" },
      h("h3", { metin: "Ayarlar" }),
      h("button", { sinif: "dg ikonlu", attr: { title: "Kapat — Esc" }, tikla: kapat }, ikon("kapat")),
    ),
    govde,
    h(
      "div",
      { sinif: "kutu-alt" },
      h("div", { sinif: "bosluk" }),
      h("button", { sinif: "dg birincil", metin: "Kapat", tikla: kapat }),
    ),
  );

  perde.addEventListener("click", kapat);
  perde.append(kutu);
  document.body.append(perde);
  document.addEventListener("keydown", tus);
  void yenidenCiz();
}

function baslik(metin: string): HTMLElement {
  return h("div", {
    sinif: "bolum",
    metin,
    stil: { marginTop: "8px", marginBottom: "0" },
  });
}

function bolumler(
  auth: { connected: boolean; email: string | null; hasClient: boolean; pending: number },
  ayar: Record<string, unknown>,
  yenile: () => Promise<void>,
): HTMLElement[] {
  const out: HTMLElement[] = [];

  // ---------------- Google
  out.push(baslik("Google Takvim"));

  if (auth.connected) {
    out.push(
      h(
        "div",
        {
          sinif: "satir",
          stil: {
            alignItems: "center",
            background: "var(--panel-2)",
            padding: "11px 13px",
            borderRadius: "10px",
            border: "1px solid var(--cizgi)",
          },
        },
        h(
          "div",
          { stil: { flex: "1", minWidth: "0" } },
          h("div", {
            metin: auth.email ?? "Bağlı hesap",
            stil: { fontWeight: "600" },
          }),
          h("div", {
            sinif: "ipucu",
            metin: auth.pending
              ? `${auth.pending} değişiklik gönderilmeyi bekliyor`
              : "Her şey senkron",
          }),
        ),
        h("button", {
          sinif: "dg",
          metin: "Şimdi senkronize et",
          tikla: () => {
            void senkronize();
            tost("Senkronizasyon başladı");
          },
        }),
        h("button", {
          sinif: "dg tehlike",
          metin: "Bağlantıyı kes",
          tikla: async () => {
            if (!confirm("Google bağlantısı kesilsin mi? Yerel kayıtlar kalır.")) return;
            await api.logout();
            await yenile();
            await yukle();
            tost("Bağlantı kesildi");
          },
        }),
      ),
    );
  } else {
    const idG = h("input", {
      sinif: "girdi",
      attr: { placeholder: "….apps.googleusercontent.com", spellcheck: "false" },
      value: String(ayar["google_client_id"] ?? ""),
    }) as HTMLInputElement;
    const srG = h("input", {
      sinif: "girdi",
      type: "password",
      attr: {
        placeholder: ayar["hasClientSecret"] ? "(kayıtlı — değiştirmek için yaz)" : "GOCSPX-…",
        spellcheck: "false",
      },
    }) as HTMLInputElement;

    const baglaDg = h("button", {
      sinif: "dg birincil",
      metin: "Google ile bağlan",
      tikla: async () => {
        if (!idG.value.trim()) {
          idG.focus();
          tost("Önce İstemci Kimliğini gir", "hata");
          return;
        }
        baglaDg.setAttribute("disabled", "true");
        baglaDg.textContent = "Tarayıcı bekleniyor…";
        try {
          await api.setSetting("google_client_id", idG.value.trim());
          if (srG.value.trim()) {
            await api.setSetting("google_client_secret", srG.value.trim());
          }
          const mail = await api.login();
          tost(`Bağlandı: ${mail || "Google hesabı"}`, "iyi");
          await senkronize();
          await yenile();
        } catch (e) {
          tost(String(e), "hata", 6000);
        } finally {
          baglaDg.removeAttribute("disabled");
          baglaDg.textContent = "Google ile bağlan";
        }
      },
    });

    out.push(
      h("label", { sinif: "alan" }, "İstemci Kimliği (Client ID)", idG),
      h("label", { sinif: "alan" }, "İstemci Gizli Anahtarı (Client Secret)", srG),
      h(
        "div",
        { sinif: "satir", stil: { alignItems: "center" } },
        baglaDg,
        h(
          "button",
          {
            sinif: "dg",
            tikla: () => void openUrl("https://console.cloud.google.com/apis/credentials"),
          },
          "Google Cloud Console",
          ikon("disari", 14),
        ),
      ),
      h("div", {
        sinif: "ipucu",
        stil: { whiteSpace: "pre-line", lineHeight: "1.7" },
        metin: KURULUM,
      }),
    );
  }

  // ---------------- senkron
  out.push(baslik("Senkronizasyon"));
  const aralikG = h("input", {
    sinif: "girdi",
    type: "number",
    attr: { min: "1", max: "240" },
    value: String(ayar["sync_interval_min"] ?? "5"),
  }) as HTMLInputElement;
  aralikG.addEventListener("change", () => {
    void api.setSetting("sync_interval_min", aralikG.value || "5");
    tost("Kaydedildi — yeni aralık bir sonraki turda geçerli");
  });
  out.push(
    h(
      "div",
      { sinif: "satir" },
      h("label", { sinif: "alan" }, "Kaç dakikada bir (arka planda)", aralikG),
      h(
        "label",
        { sinif: "alan" },
        "Saat dilimi",
        h("input", {
          sinif: "girdi",
          value: String(
            ayar["time_zone"] ??
              Intl.DateTimeFormat().resolvedOptions().timeZone ??
              "Europe/Istanbul",
          ),
          onchange: (e: Event) =>
            void api.setSetting("time_zone", (e.target as HTMLInputElement).value.trim()),
        }),
      ),
    ),
  );

  // ---------------- takvim renkleri
  if (state.calendars.length) {
    out.push(baslik("Takvim renkleri"));
    for (const c of state.calendars) {
      const noktalar = h(
        "div",
        { sinif: "renk-sirasi" },
        ...RENKLER.map((r) =>
          h("div", {
            sinif: `renk-nokta ${c.color.toLowerCase() === r ? "secili" : ""}`,
            stil: { background: r, width: "18px", height: "18px" },
            tikla: async () => {
              await api.setCalendarColor(c.id, r);
              await yukle();
              await yenile();
            },
          }),
        ),
      );
      out.push(
        h(
          "div",
          { sinif: "satir", stil: { alignItems: "center", gap: "12px" } },
          h("div", {
            metin: c.summary,
            stil: { flex: "1", fontSize: "13px", minWidth: "0" },
          }),
          noktalar,
        ),
      );
    }
  }

  // ---------------- görünüm
  out.push(baslik("Görünüm"));
  const koyu = (localStorage.getItem("tema") ?? "koyu") === "koyu";
  const temaG = h("input", { type: "checkbox", checked: koyu }) as HTMLInputElement;
  temaG.addEventListener("change", () => {
    const t = temaG.checked ? "koyu" : "acik";
    localStorage.setItem("tema", t);
    document.documentElement.dataset.tema = t;
    ciz();
  });
  out.push(h("label", { sinif: "salter" }, temaG, "Koyu tema"));

  // ---------------- veri
  out.push(baslik("Veri"));
  const yolAlan = h("div", { sinif: "ipucu", metin: "…" });
  void api.dbPath().then((p) => {
    yolAlan.textContent = p;
  });
  out.push(
    yolAlan,
    h("div", {
      sinif: "ipucu",
      metin:
        "Tüm etkinlikler bu SQLite dosyasında. Google bağlı değilken de her şey burada tutulur; " +
        "bağlandığında bekleyen değişiklikler gönderilir.",
    }),
  );

  return out;
}
