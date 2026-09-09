import { listen } from "@tauri-apps/api/event";
import "./styles/app.css";

import { api } from "./core/api";
import {
  AYLAR,
  ayEkle,
  gunBasi,
  gunEkle,
  haftaBasi,
  goreliGun,
  haftaNo,
  saat,
  tarihKisa,
  tarihUzun,
} from "./core/date";
import {
  abone,
  aralik,
  ciz,
  gorunumAyarla,
  hesapla,
  senkronize,
  state,
  takvimRengi,
  tariheGit,
  yukle,
} from "./core/store";
import type { SyncResult, ViewName } from "./core/types";
import { bosalt, ekle, h } from "./ui/dom";
import { ikon, logo } from "./ui/icons";
import { olayDuzenleyici } from "./ui/editor";
import { palet } from "./ui/palette";
import { ayarlar } from "./ui/settings";
import { tost } from "./ui/toast";
import { programGorunumu } from "./views/agenda";
import { ayGorunumu, miniAy } from "./views/month";
import { haftaGorunumu } from "./views/week";
import { yilGorunumu } from "./views/year";

const GORUNUMLER: [ViewName, string, string][] = [
  ["gun", "Gün", "1"],
  ["hafta", "Hafta", "2"],
  ["ay", "Ay", "3"],
  ["yil", "Yıl", "4"],
  ["program", "Program", "5"],
];

document.documentElement.dataset.tema = localStorage.getItem("tema") ?? "koyu";

const kok = h("div", { id: "uygulama" });
const ustCubuk = h("div", { sinif: "ust" });
const kenar = h("div", { sinif: "kenar" });
const ana = h("div", { sinif: "ana" });
kok.append(ustCubuk, kenar, ana);
document.body.append(kok);

// mini ayın gezindiği ay (ana odaktan bağımsız olabilir)
let miniOdak = new Date();

// ------------------------------------------------------------------ başlık

function baslikMetni(): HTMLElement {
  const a = state.anchor;
  switch (state.view) {
    case "gun":
      return h(
        "div",
        { sinif: "baslik" },
        `${a.getDate()} ${AYLAR[a.getMonth()]} `,
        h("span", { sinif: "yil", metin: String(a.getFullYear()) }),
      );
    case "hafta": {
      const b = haftaBasi(a);
      const s = gunEkle(b, 6);
      const ayni = b.getMonth() === s.getMonth();
      return h(
        "div",
        { sinif: "baslik" },
        ayni
          ? `${b.getDate()}–${s.getDate()} ${AYLAR[b.getMonth()]} `
          : `${tarihKisa(b)} – ${tarihKisa(s)} `,
        h("span", { sinif: "yil", metin: `${s.getFullYear()} · ${haftaNo(b)}. hafta` }),
      );
    }
    case "ay":
      return h(
        "div",
        { sinif: "baslik" },
        `${AYLAR[a.getMonth()]} `,
        h("span", { sinif: "yil", metin: String(a.getFullYear()) }),
      );
    case "yil":
      return h("div", { sinif: "baslik", metin: String(a.getFullYear()) });
    case "program":
      return h(
        "div",
        { sinif: "baslik" },
        "Program ",
        h("span", { sinif: "yil", metin: tarihKisa(state.anchor) + "’den itibaren" }),
      );
  }
}

function kaydir(yon: -1 | 1): void {
  const a = state.anchor;
  switch (state.view) {
    case "gun":
      tariheGit(gunEkle(a, yon));
      break;
    case "hafta":
      tariheGit(gunEkle(a, 7 * yon));
      break;
    case "ay":
      tariheGit(ayEkle(a, yon));
      break;
    case "yil":
      tariheGit(new Date(a.getFullYear() + yon, a.getMonth(), 1));
      break;
    case "program":
      tariheGit(gunEkle(a, 14 * yon));
      break;
  }
  miniOdak = new Date(state.anchor);
}

// ------------------------------------------------------------------- üst

/** Görünüm anahtarı: etiketler sabit, altındaki gösterge kayar. */
function gorunumAnahtari(): HTMLElement {
  const gosterge = h("div", { sinif: "gosterge" });
  const dugmeler = GORUNUMLER.map(([v, ad, tus]) =>
    h("button", {
      sinif: state.view === v ? "aktif" : "",
      metin: ad,
      attr: { title: `${ad} görünümü — ${tus}`, "aria-pressed": state.view === v },
      tikla: () => gorunumAyarla(v),
    }),
  );
  const kap = h("div", { sinif: "anahtar" }, gosterge, ...dugmeler);
  // Gösterge ölçüyle yerleşir; etiket uzunlukları dile göre değişebiliyor.
  queueMicrotask(() => {
    const aktif = dugmeler[GORUNUMLER.findIndex(([v]) => v === state.view)];
    if (!aktif) return;
    gosterge.style.width = `${aktif.offsetWidth}px`;
    gosterge.style.transform = `translateX(${aktif.offsetLeft - 3}px)`;
  });
  return kap;
}

/** Senkron durumu tek bir sessiz göstergede toplanır. */
function durumGostergesi(): HTMLElement {
  if (!state.auth.connected) {
    return h(
      "button",
      {
        sinif: "durum",
        attr: { title: "Google bağlı değil — kayıtlar yalnızca bu bilgisayarda" },
        tikla: ayarlar,
      },
      ikon("kesik", 15),
      "Yerel",
    );
  }
  if (state.senkron === "calisiyor") {
    const d = ikon("senkron", 15);
    d.classList.add("donuyor");
    return h("button", { sinif: "durum", attr: { title: "Senkronize ediliyor" } }, d, "Senkron");
  }
  if (state.senkron === "hata") {
    return h(
      "button",
      {
        sinif: "durum hatali",
        attr: { title: state.senkronNot },
        tikla: () => tost(state.senkronNot, "hata", 7000),
      },
      ikon("uyari", 15),
      "Hata",
    );
  }
  if (state.auth.pending > 0) {
    return h(
      "button",
      {
        sinif: "durum bekleyen",
        attr: { title: `${state.auth.pending} değişiklik gönderilmeyi bekliyor` },
        tikla: () => void senkronize(),
      },
      ikon("bulut", 15),
      String(state.auth.pending),
    );
  }
  return h(
    "button",
    {
      sinif: "durum",
      attr: {
        title: state.auth.lastSync
          ? `Son senkron ${saat(new Date(state.auth.lastSync))} — yenilemek için tıkla`
          : "Senkronize et",
      },
      tikla: () => void senkronize(),
    },
    ikon("bulut", 15),
    state.auth.lastSync ? saat(new Date(state.auth.lastSync)) : "Senkron",
  );
}

function ustCiz(): void {
  ekle(
    bosalt(ustCubuk),
    h("div", { sinif: "marka" }, logo(22), "Ajanda"),
    h(
      "div",
      { sinif: "gezinti", stil: { display: "flex", alignItems: "center", gap: "2px" } },
      h("button", {
        sinif: "dg cerceve",
        metin: "Bugün",
        attr: { title: "Bugüne dön — T" },
        tikla: () => {
          miniOdak = new Date();
          tariheGit(new Date());
        },
      }),
      h("button", { sinif: "dg ikonlu", attr: { title: "Geri — ←" }, tikla: () => kaydir(-1) }, ikon("sol")),
      h("button", { sinif: "dg ikonlu", attr: { title: "İleri — →" }, tikla: () => kaydir(1) }, ikon("sag")),
    ),
    baslikMetni(),
    h("div", { sinif: "bosluk" }),
    durumGostergesi(),
    gorunumAnahtari(),
    h(
      "button",
      { sinif: "dg ikonlu", attr: { title: "Ara ve hızlı ekle — Ctrl+K" }, tikla: palet },
      ikon("ara"),
    ),
    h("button", { sinif: "dg ikonlu", attr: { title: "Ayarlar" }, tikla: ayarlar }, ikon("ayar")),
  );
}

// ---------------------------------------------------------------- kenar

/** "14 dk sonra", "2 sa 10 dk sonra", "şu an" — sıradakiler için. */
function neZaman(o: { start: Date; end: Date; event: { allDay: boolean } }): string {
  const simdi = Date.now();
  if (o.start.getTime() <= simdi && o.end.getTime() >= simdi) return "şu an";
  if (o.event.allDay) return goreliGun(o.start).toLocaleLowerCase("tr");
  const dk = Math.round((o.start.getTime() - simdi) / 60000);
  if (dk < 60) return `${dk} dk sonra`;
  if (dk < 60 * 10) {
    const s = Math.floor(dk / 60);
    const k = dk % 60;
    return k ? `${s} sa ${k} dk sonra` : `${s} saat sonra`;
  }
  return goreliGun(o.start).toLocaleLowerCase("tr");
}

function kenarCiz(): void {
  const simdi = Date.now();
  const yaklasan = state.occurrences
    .filter((o) => o.end.getTime() >= simdi)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, 5);

  ekle(
    bosalt(kenar),
    h(
      "button",
      {
        sinif: "ekle-dg",
        attr: { title: "Yeni etkinlik — N" },
        tikla: () => {
          const b = new Date(state.anchor);
          const n = new Date();
          b.setHours(n.getHours() + 1, 0, 0, 0);
          olayDuzenleyici({ start: b, end: new Date(b.getTime() + 3600000) });
        },
      },
      ikon("arti", 16),
      "Etkinlik ekle",
      h("span", { sinif: "kisayol", metin: "N" }),
    ),

    miniAy(
      miniOdak,
      state.anchor,
      (d) => {
        miniOdak = new Date(d);
        tariheGit(d);
      },
      (n) => {
        miniOdak = ayEkle(miniOdak, n);
        ciz();
      },
    ),

    h(
      "div",
      null,
      h("div", { sinif: "bolum" }, "Takvimler"),
      ...state.calendars.map((c) =>
        h(
          "div",
          {
            sinif: `takvim-satir ${c.visible ? "acik" : ""}`,
            stil: { "--renk": c.color },
            attr: { title: c.visible ? `${c.summary} — gizle` : `${c.summary} — göster` },
            tikla: async () => {
              await api.setCalendarVisible(c.id, !c.visible);
              c.visible = !c.visible;
              hesapla();
              ciz();
            },
          },
          h("div", { sinif: "kutu" }, ikon("onay", 11)),
          h("div", { sinif: "ad", metin: c.summary }),
        ),
      ),
    ),

    yaklasan.length
      ? h(
          "div",
          null,
          h("div", { sinif: "bolum" }, "Sıradakiler"),
          ...yaklasan.map((o) => {
            const zaman = neZaman(o);
            const yakin =
              !o.event.allDay && o.start.getTime() - simdi < 90 * 60000;
            return h(
              "div",
              {
                sinif: `sonraki ${yakin ? "yakin" : ""}`,
                stil: { "--renk": takvimRengi(o.event) },
                tikla: () => olayDuzenleyici({ event: o.event }),
              },
              h("div", { sinif: "ad", metin: o.event.title || "(başlıksız)" }),
              h(
                "div",
                { sinif: "zaman" },
                o.event.allDay ? "Tüm gün" : `${tarihKisa(o.start)} · ${saat(o.start)}`,
                h("span", { metin: "·", stil: { opacity: "0.5" } }),
                zaman,
              ),
            );
          }),
        )
      : null,
  );
}

// ----------------------------------------------------------------- ana

function anaCiz(): void {
  bosalt(ana);
  if (state.yukleniyor) {
    const d = ikon("senkron", 26);
    d.classList.add("donuyor");
    ana.append(h("div", { sinif: "bos-durum" }, d));
    return;
  }
  switch (state.view) {
    case "gun":
      ana.append(haftaGorunumu(1));
      break;
    case "hafta":
      ana.append(haftaGorunumu(7));
      break;
    case "ay":
      ana.append(ayGorunumu());
      break;
    case "yil":
      ana.append(yilGorunumu());
      break;
    case "program":
      ana.append(programGorunumu());
      break;
  }
}

abone(() => {
  ustCiz();
  kenarCiz();
  anaCiz();
});

// ------------------------------------------------------------ klavye

document.addEventListener("keydown", (e) => {
  const hedef = e.target as HTMLElement;
  const yaziyor =
    hedef instanceof HTMLInputElement ||
    hedef instanceof HTMLTextAreaElement ||
    hedef instanceof HTMLSelectElement;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    palet();
    return;
  }
  if (document.querySelector(".perde, .palet")) return;
  if (yaziyor) return;

  // Kısayolun kendisi yazı alanına düşmesin (yeni etkinlik "n" ile açılıp
  // başlığa "n" yazıyordu).
  const kisayol = "tTnNrR/12345".includes(e.key) || e.key.startsWith("Arrow");
  if (kisayol) e.preventDefault();

  switch (e.key) {
    case "ArrowLeft":
      kaydir(-1);
      break;
    case "ArrowRight":
      kaydir(1);
      break;
    case "t":
    case "T":
      miniOdak = new Date();
      tariheGit(new Date());
      break;
    case "n":
    case "N": {
      const b = new Date(state.anchor);
      b.setHours(new Date().getHours() + 1, 0, 0, 0);
      olayDuzenleyici({ start: b, end: new Date(b.getTime() + 3600000) });
      break;
    }
    case "/":
      palet();
      break;
    case "r":
    case "R":
      if (state.auth.connected) void senkronize();
      break;
    case "1":
    case "2":
    case "3":
    case "4":
    case "5": {
      const v = GORUNUMLER.find(([, , t]) => t === e.key);
      if (v) gorunumAyarla(v[0]);
      break;
    }
  }
});

// ------------------------------------------------------- arka plan olayları

/** Tauri dışında (tarayıcı önizlemesi) olay dinleyici yok — sessizce geç. */
function dinle<T>(ad: string, fn: (olay: { payload: T }) => void): void {
  try {
    void listen<T>(ad, fn).catch(() => undefined);
  } catch {
    /* Tauri yok */
  }
}

dinle<SyncResult>("sync-done", (olay) => {
  const r = olay.payload;
  state.senkron = r.errors.length ? "hata" : "bos";
  state.senkronNot = r.errors[0] ?? "";
  if (r.pulled || r.pushed || r.deleted) {
    void yukle();
  } else {
    void api.authStatus().then((a) => {
      state.auth = a;
      ciz();
    });
  }
});

dinle<string>("sync-error", (olay) => {
  state.senkron = "hata";
  state.senkronNot = olay.payload;
  ciz();
});

// "şimdi" çizgisi ve geçmiş etkinliklerin solması için dakikada bir tazele
setInterval(() => {
  if (document.querySelector(".perde, .palet")) return;
  if (state.view === "gun" || state.view === "hafta") anaCiz();
}, 60000);

// gün değişince başlık ve "bugün" vurgusu kaymasın
let sonGun = gunBasi(new Date()).getTime();
setInterval(() => {
  const bugun = gunBasi(new Date()).getTime();
  if (bugun !== sonGun) {
    sonGun = bugun;
    void yukle();
  }
}, 60000);

// ---------------------------------------------------------------- başlat

void (async () => {
  // Tarayıcıda `vite dev` ile açıldıysa sahte arka ucu yükle (üretimde elenir).
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    await import("./core/mock");
  }
  await yukle();
  const { bas, bit } = aralik();
  console.debug("Ajanda hazır", tarihUzun(bas), "→", tarihUzun(bit));
  // İlk açılışta Google bağlıysa hemen bir tur senkron.
  if (state.auth.connected) void senkronize(true);
})();
