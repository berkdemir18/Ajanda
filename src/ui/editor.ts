import { api } from "../core/api";
import { dakikaEkle, rfc3339, saat, sureMetni, ymd, ymdCoz } from "../core/date";
import { evEnd, evStart, rruleMetni } from "../core/recur";
import { state, takvimRengi, yukle } from "../core/store";
import type { CalEvent } from "../core/types";
import { h, sec } from "./dom";
import { ikon } from "./icons";
import { tost } from "./toast";

/** Arka uçtaki `PALET` ile birebir aynı; renkler tek yerden gelir. */
export const RENKLER = [
  "#ff6a3d", "#f0a03c", "#d6c24c", "#7db86e", "#4fb6a8",
  "#58a8ea", "#7f8cf2", "#a87cea", "#ea71a2", "#bc8568",
];

const HATIRLATMA = [
  [-1, "Kapalı"],
  [0, "Tam zamanında"],
  [5, "5 dk önce"],
  [10, "10 dk önce"],
  [15, "15 dk önce"],
  [30, "30 dk önce"],
  [60, "1 saat önce"],
  [120, "2 saat önce"],
  [1440, "1 gün önce"],
] as const;

const GUN_KODU = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

interface Acilis {
  event?: CalEvent;
  start?: Date;
  end?: Date;
  allDay?: boolean;
}

function saatSecenekleri(): string[] {
  const out: string[] = [];
  for (let d = 0; d < 24 * 60; d += 15) {
    out.push(
      `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`,
    );
  }
  return out;
}

function tarihSaatBirlestir(tarih: string, saatStr: string): Date {
  const d = ymdCoz(tarih);
  const [h1, m1] = saatStr.split(":").map(Number);
  d.setHours(h1 || 0, m1 || 0, 0, 0);
  return d;
}

/** Etkinlik düzenleyici. Tekrarlı olaylarda ana kayıt düzenlenir. */
export function olayDuzenleyici(acilis: Acilis): void {
  const mevcut = acilis.event;
  const yeni = !mevcut;

  const bas = mevcut ? evStart(mevcut) : (acilis.start ?? new Date());
  const bit = mevcut ? evEnd(mevcut) : (acilis.end ?? dakikaEkle(bas, 60));
  let tumGun = mevcut ? mevcut.allDay : (acilis.allDay ?? false);

  const yazilabilir = state.calendars.filter(
    (c) => c.isLocal || c.accessRole === "owner" || c.accessRole === "writer",
  );
  const varsayilanTakvim =
    mevcut?.calendarId ??
    (localStorage.getItem("sonTakvim") &&
    yazilabilir.some((c) => c.id === localStorage.getItem("sonTakvim"))
      ? localStorage.getItem("sonTakvim")!
      : (yazilabilir.find((c) => c.isPrimary) ?? yazilabilir[0])?.id) ??
    "local";

  let renk: string | null = mevcut?.color ?? null;
  let rrule: string | null = mevcut?.rrule ?? null;

  // --- alanlar
  const baslikG = h("input", {
    sinif: "girdi buyuk",
    attr: { placeholder: "Etkinlik başlığı", maxlength: 200 },
    value: mevcut?.title ?? "",
  }) as HTMLInputElement;

  const takvimG = h(
    "select",
    { sinif: "girdi" },
    ...yazilabilir.map((c) =>
      h("option", { value: c.id, metin: c.summary, selected: c.id === varsayilanTakvim }),
    ),
  ) as HTMLSelectElement;

  const basTarihG = h("input", {
    sinif: "girdi",
    type: "date",
    value: ymd(bas),
  }) as HTMLInputElement;
  const bitTarihG = h("input", {
    sinif: "girdi",
    type: "date",
    value: ymd(bit),
  }) as HTMLInputElement;

  const saatler = saatSecenekleri();
  const yakinSaat = (d: Date) => {
    const dk = Math.round((d.getHours() * 60 + d.getMinutes()) / 15) * 15;
    return `${String(Math.floor(dk / 60) % 24).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`;
  };
  const saatSelect = (deger: string) =>
    h(
      "select",
      { sinif: "girdi" },
      ...saatler.map((s) => h("option", { value: s, metin: s, selected: s === deger })),
      !saatler.includes(deger) ? h("option", { value: deger, metin: deger, selected: true }) : null,
    ) as HTMLSelectElement;

  const basSaatG = saatSelect(mevcut && !mevcut.allDay ? saat(bas) : yakinSaat(bas));
  const bitSaatG = saatSelect(mevcut && !mevcut.allDay ? saat(bit) : yakinSaat(bit));

  const sureEtiket = h("span", {
    sinif: "ipucu",
    stil: { marginLeft: "auto", fontSize: "11.5px" },
  });

  const tumGunG = h("input", { type: "checkbox", checked: tumGun }) as HTMLInputElement;

  const yerG = h("input", {
    sinif: "girdi",
    attr: { placeholder: "Yer (isteğe bağlı)" },
    value: mevcut?.location ?? "",
  }) as HTMLInputElement;

  const notG = h("textarea", {
    sinif: "girdi",
    attr: { placeholder: "Not…" },
    value: mevcut?.description ?? "",
  }) as HTMLTextAreaElement;

  const hatirlatG = h(
    "select",
    { sinif: "girdi" },
    ...HATIRLATMA.map(([v, ad]) =>
      h("option", {
        value: String(v),
        metin: ad,
        selected: (mevcut?.reminderMin ?? -1) === v,
      }),
    ),
  ) as HTMLSelectElement;

  // --- tekrar
  const tekrarSecenekleri = () => {
    const g = GUN_KODU[(ymdCoz(basTarihG.value).getDay() + 6) % 7];
    return [
      ["", "Tekrar yok"],
      ["RRULE:FREQ=DAILY", "Her gün"],
      [`RRULE:FREQ=WEEKLY;BYDAY=${g}`, "Her hafta"],
      ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "Hafta içi her gün"],
      ["RRULE:FREQ=MONTHLY", "Her ay"],
      ["RRULE:FREQ=YEARLY", "Her yıl"],
    ] as [string, string][];
  };

  const tekrarG = h("select", { sinif: "girdi" }) as HTMLSelectElement;
  const tekrarYenile = () => {
    const secenekler = tekrarSecenekleri();
    const mevcutDeger = rrule ?? "";
    tekrarG.replaceChildren(
      ...secenekler.map(([v, ad]) =>
        h("option", { value: v, metin: ad, selected: v === mevcutDeger }),
      ),
    );
    if (mevcutDeger && !secenekler.some(([v]) => v === mevcutDeger)) {
      tekrarG.append(
        h("option", {
          value: mevcutDeger,
          metin: `Özel: ${rruleMetni(mevcutDeger)}`,
          selected: true,
        }),
      );
    }
  };
  tekrarYenile();
  tekrarG.addEventListener("change", () => {
    rrule = tekrarG.value || null;
  });

  // --- renk
  const renkSirasi = h("div", { sinif: "renk-sirasi" });
  const renkCiz = () => {
    const takvimRenk =
      state.calendars.find((c) => c.id === takvimG.value)?.color ?? "#5b8def";
    renkSirasi.replaceChildren(
      h("div", {
        sinif: `renk-nokta ${renk === null ? "secili" : ""}`,
        stil: { background: takvimRenk, opacity: "0.55" },
        attr: { title: "Takvim rengi" },
        tikla: () => {
          renk = null;
          renkCiz();
        },
      }),
      ...RENKLER.map((c) =>
        h("div", {
          sinif: `renk-nokta ${renk === c ? "secili" : ""}`,
          stil: { background: c },
          tikla: () => {
            renk = c;
            renkCiz();
          },
        }),
      ),
    );
  };
  renkCiz();
  takvimG.addEventListener("change", renkCiz);

  // --- tüm gün geçişi
  const zamanSatiri = h(
    "div",
    { sinif: "satir" },
    h("label", { sinif: "alan" }, "Başlangıç", basTarihG),
    h("label", { sinif: "alan", stil: { maxWidth: "110px" } }, " ", basSaatG),
    h("label", { sinif: "alan" }, "Bitiş", bitTarihG),
    h("label", { sinif: "alan", stil: { maxWidth: "110px" } }, " ", bitSaatG),
  );

  const sureGuncelle = () => {
    if (tumGun) {
      const g =
        Math.round(
          (ymdCoz(bitTarihG.value).getTime() - ymdCoz(basTarihG.value).getTime()) /
            86400000,
        ) + 1;
      sureEtiket.textContent = g > 1 ? `${g} gün` : "Tüm gün";
      return;
    }
    const b = tarihSaatBirlestir(basTarihG.value, basSaatG.value);
    const s = tarihSaatBirlestir(bitTarihG.value, bitSaatG.value);
    const dk = Math.round((s.getTime() - b.getTime()) / 60000);
    sureEtiket.textContent = dk > 0 ? sureMetni(dk) : "Bitiş başlangıçtan önce!";
    sureEtiket.style.color = dk > 0 ? "" : "var(--hata)";
  };

  const tumGunUygula = () => {
    basSaatG.parentElement!.style.display = tumGun ? "none" : "";
    bitSaatG.parentElement!.style.display = tumGun ? "none" : "";
    sureGuncelle();
  };
  tumGunG.addEventListener("change", () => {
    tumGun = tumGunG.checked;
    tumGunUygula();
  });

  // Başlangıç değişince bitişi aynı farkla kaydır — elle düzeltmek zorunda kalma.
  let oncekiBas = tarihSaatBirlestir(basTarihG.value, basSaatG.value).getTime();
  const basDegisti = () => {
    const yeniBas = tarihSaatBirlestir(basTarihG.value, basSaatG.value);
    const eskiBit = tarihSaatBirlestir(bitTarihG.value, bitSaatG.value);
    const fark = yeniBas.getTime() - oncekiBas;
    const yeniBit = new Date(eskiBit.getTime() + fark);
    bitTarihG.value = ymd(yeniBit);
    if (!tumGun) bitSaatG.value = saat(yeniBit);
    oncekiBas = yeniBas.getTime();
    tekrarYenile();
    sureGuncelle();
  };
  basTarihG.addEventListener("change", basDegisti);
  basSaatG.addEventListener("change", basDegisti);
  bitTarihG.addEventListener("change", sureGuncelle);
  bitSaatG.addEventListener("change", sureGuncelle);

  // --- kutu
  const perde = h("div", { sinif: "perde" });
  const kapat = () => {
    perde.remove();
    document.removeEventListener("keydown", tusDinle);
  };
  const tusDinle = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      kapat();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void kaydet();
  };

  async function kaydet(): Promise<void> {
    const baslik = baslikG.value.trim();
    if (!baslik) {
      baslikG.focus();
      baslikG.style.borderColor = "var(--hata)";
      return;
    }
    let startAt: string;
    let endAt: string;
    if (tumGun) {
      startAt = basTarihG.value;
      endAt = bitTarihG.value < basTarihG.value ? basTarihG.value : bitTarihG.value;
    } else {
      const b = tarihSaatBirlestir(basTarihG.value, basSaatG.value);
      let s = tarihSaatBirlestir(bitTarihG.value, bitSaatG.value);
      if (s <= b) s = dakikaEkle(b, 30);
      startAt = rfc3339(b);
      endAt = rfc3339(s);
    }
    const hatirlat = Number(hatirlatG.value);
    try {
      await api.saveEvent({
        id: mevcut?.id ?? null,
        calendarId: takvimG.value,
        title: baslik,
        description: notG.value.trim() || null,
        location: yerG.value.trim() || null,
        startAt,
        endAt,
        allDay: tumGun,
        rrule,
        color: renk,
        reminderMin: hatirlat < 0 ? null : hatirlat,
        done: mevcut?.done ?? false,
      });
      localStorage.setItem("sonTakvim", takvimG.value);
      kapat();
      await yukle();
      tost(yeni ? "Etkinlik eklendi" : "Etkinlik güncellendi", "iyi");
    } catch (e) {
      tost(`Kaydedilemedi: ${e}`, "hata");
    }
  }

  async function sil(): Promise<void> {
    if (!mevcut) return;
    const soru = mevcut.rrule
      ? `"${mevcut.title}" tekrarlı bir etkinlik. Tüm tekrarları silinecek. Emin misin?`
      : `"${mevcut.title}" silinsin mi?`;
    if (!confirm(soru)) return;
    try {
      await api.deleteEvent(mevcut.id);
      kapat();
      await yukle();
      tost("Etkinlik silindi", "iyi");
    } catch (e) {
      tost(`Silinemedi: ${e}`, "hata");
    }
  }

  const kutu = h(
    "div",
    { sinif: "kutu", onclick: (e: Event) => e.stopPropagation() },
    h(
      "div",
      { sinif: "kutu-ust" },
      h("h3", { metin: yeni ? "Yeni etkinlik" : "Etkinliği düzenle" }),
      h("button", { sinif: "dg ikonlu", attr: { title: "Kapat — Esc" }, tikla: kapat }, ikon("kapat")),
    ),
    h(
      "div",
      { sinif: "kutu-govde" },
      baslikG,
      h(
        "div",
        { sinif: "satir", stil: { alignItems: "center" } },
        h("label", { sinif: "salter" }, tumGunG, "Tüm gün"),
        sureEtiket,
      ),
      zamanSatiri,
      h(
        "div",
        { sinif: "satir" },
        h("label", { sinif: "alan" }, "Takvim", takvimG),
        h("label", { sinif: "alan" }, "Tekrar", tekrarG),
      ),
      h(
        "div",
        { sinif: "satir" },
        h("label", { sinif: "alan" }, "Hatırlatma", hatirlatG),
        h("label", { sinif: "alan" }, "Yer", yerG),
      ),
      h("label", { sinif: "alan" }, "Renk", renkSirasi),
      h("label", { sinif: "alan" }, "Not", notG),
      mevcut?.rrule
        ? h(
            "div",
            { sinif: "ipucu", stil: { display: "flex", alignItems: "center", gap: "6px" } },
            ikon("tekrar", 13),
            `${rruleMetni(mevcut.rrule)} — değişiklik tüm tekrarları etkiler.`,
          )
        : null,
      mevcut?.googleId
        ? null
        : h("div", {
            sinif: "ipucu",
            metin: state.auth.connected
              ? "Bu kayıt henüz Google'a gönderilmedi; ilk senkronda gidecek."
              : "Google bağlı değil — şimdilik yalnızca bu bilgisayarda tutulacak.",
          }),
    ),
    h(
      "div",
      { sinif: "kutu-alt" },
      mevcut
        ? h(
            "button",
            { sinif: "dg tehlike", attr: { title: "Etkinliği sil" }, tikla: () => void sil() },
            ikon("cop", 15),
            "Sil",
          )
        : null,
      h("div", { sinif: "bosluk" }),
      h("button", { sinif: "dg cerceve", metin: "Vazgeç", tikla: kapat }),
      h("button", {
        sinif: "dg birincil",
        metin: yeni ? "Ekle" : "Kaydet",
        attr: { title: "Ctrl+Enter" },
        tikla: () => void kaydet(),
      }),
    ),
  );

  perde.addEventListener("click", kapat);
  perde.append(kutu);
  document.body.append(perde);
  document.addEventListener("keydown", tusDinle);

  tumGunUygula();
  sureGuncelle();
  baslikG.focus();
  baslikG.select();
  if (renk === null && mevcut) {
    // renk noktası takvim rengini göstersin
    sec<HTMLElement>(".renk-nokta", renkSirasi).style.background = takvimRengi(mevcut);
  }
}
