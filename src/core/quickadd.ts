import { AYLAR, gunBasi, gunEkle, haftaGunu } from "./date";

export interface HizliSonuc {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  rrule: string | null;
  /** Metinden gerçekten okunan parçalar — kullanıcıya geri gösterilir. */
  ipuclari: string[];
}

const GUN_ADLARI = [
  ["pazartesi", "pzt"],
  ["salı", "sali", "sal"],
  ["çarşamba", "carsamba", "çar", "car"],
  ["perşembe", "persembe", "per"],
  ["cuma", "cum"],
  ["cumartesi", "cmt"],
  ["pazar", "paz"],
];
const GUN_KODU = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const AY_ADLARI = AYLAR.map((a) => a.toLocaleLowerCase("tr"));
const AY_ASCII = [
  "ocak", "subat", "mart", "nisan", "mayis", "haziran",
  "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik",
];

function norm(s: string): string {
  return s.toLocaleLowerCase("tr");
}

/**
 * "yarın 15:00 diş hekimi 2 saat" gibi bir cümleyi olaya çevirir.
 * Anlaşılmayan her şey başlık olarak kalır — kural: hiçbir zaman boş dönme.
 */
export function hizliCoz(ham: string, simdi = new Date()): HizliSonuc {
  let metin = ham.trim();
  const ipuclari: string[] = [];

  const sil = (re: RegExp, ipucu?: string): RegExpMatchArray | null => {
    const m = metin.match(re);
    if (m) {
      metin = (metin.slice(0, m.index!) + " " + metin.slice(m.index! + m[0].length)).trim();
      if (ipucu) ipuclari.push(ipucu);
    }
    return m;
  };

  // ---- tekrar
  let rrule: string | null = null;
  const herGunlukM = metin.match(/\bher\s+g[üu]n\b/i);
  const herHaftaM = metin.match(/\bher\s+hafta\b/i);
  const herAyM = metin.match(/\bher\s+ay\b/i);
  const herYilM = metin.match(/\bher\s+y[ıi]l\b/i);
  const hafta_ici = metin.match(/\bhafta\s*i[çc]i\b/i);

  let herGunAdi = -1;
  for (let i = 0; i < GUN_ADLARI.length; i++) {
    const re = new RegExp(`\\bher\\s+(${GUN_ADLARI[i].join("|")})\\b`, "i");
    if (re.test(metin)) {
      herGunAdi = i;
      sil(re, `her ${GUN_ADLARI[i][0]}`);
      break;
    }
  }

  if (hafta_ici) {
    sil(/\bhafta\s*i[çc]i\b/i, "hafta içi");
    rrule = "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
  } else if (herGunAdi >= 0) {
    rrule = `RRULE:FREQ=WEEKLY;BYDAY=${GUN_KODU[herGunAdi]}`;
  } else if (herGunlukM) {
    sil(/\bher\s+g[üu]n\b/i, "her gün");
    rrule = "RRULE:FREQ=DAILY";
  } else if (herHaftaM) {
    sil(/\bher\s+hafta\b/i, "her hafta");
    rrule = "RRULE:FREQ=WEEKLY";
  } else if (herAyM) {
    sil(/\bher\s+ay\b/i, "her ay");
    rrule = "RRULE:FREQ=MONTHLY";
  } else if (herYilM) {
    sil(/\bher\s+y[ıi]l\b/i, "her yıl");
    rrule = "RRULE:FREQ=YEARLY";
  }

  // ---- süre
  let sureDk: number | null = null;
  const yarimSaat = sil(/\byar[ıi]m\s+saat\b/i, "yarım saat");
  if (yarimSaat) sureDk = 30;
  if (sureDk === null) {
    const m = sil(/\b(\d+(?:[.,]\d+)?)\s*(saat|sa)\b/i);
    if (m) {
      sureDk = Math.round(Number(m[1].replace(",", ".")) * 60);
      ipuclari.push(`${m[1]} saat`);
    }
  }
  if (sureDk === null) {
    const m = sil(/\b(\d{1,3})\s*(dakika|dk)\b/i);
    if (m) {
      sureDk = Number(m[1]);
      ipuclari.push(`${m[1]} dk`);
    }
  }

  // ---- gün
  let tarih: Date | null = null;

  if (sil(/\byar[ıi]n\b/i, "yarın")) tarih = gunEkle(gunBasi(simdi), 1);
  else if (sil(/\b[öo]b[üu]r\s+g[üu]n\b/i, "öbür gün")) tarih = gunEkle(gunBasi(simdi), 2);
  else if (sil(/\bbug[üu]n\b/i, "bugün")) tarih = gunBasi(simdi);
  else if (sil(/\bd[üu]n\b/i, "dün")) tarih = gunEkle(gunBasi(simdi), -1);

  // "12 eylül" / "12 eylül 2027"
  if (!tarih) {
    const adlar = [...AY_ADLARI, ...AY_ASCII].join("|");
    const m = sil(new RegExp(`\\b(\\d{1,2})\\s+(${adlar})(?:\\s+(\\d{4}))?\\b`, "i"));
    if (m) {
      const n = norm(m[2]);
      let ay = AY_ADLARI.indexOf(n);
      if (ay < 0) ay = AY_ASCII.indexOf(n);
      const yil = m[3] ? Number(m[3]) : simdi.getFullYear();
      tarih = new Date(yil, ay, Number(m[1]));
      if (!m[3] && tarih < gunBasi(simdi)) tarih.setFullYear(yil + 1);
      ipuclari.push(`${m[1]} ${AYLAR[ay]}`);
    }
  }

  // "12.09" / "12/09/2026"
  if (!tarih) {
    const m = sil(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
    if (m) {
      const yilHam = m[3] ? Number(m[3]) : simdi.getFullYear();
      const yil = yilHam < 100 ? 2000 + yilHam : yilHam;
      tarih = new Date(yil, Number(m[2]) - 1, Number(m[1]));
      if (!m[3] && tarih < gunBasi(simdi)) tarih.setFullYear(yil + 1);
      ipuclari.push(`${m[1]}.${m[2]}`);
    }
  }

  // gün adı: "salı", "gelecek salı"
  if (!tarih) {
    for (let i = 0; i < GUN_ADLARI.length; i++) {
      const re = new RegExp(
        `\\b(gelecek\\s+|[öo]n[üu]m[üu]zdeki\\s+|haftaya\\s+)?(${GUN_ADLARI[i].join("|")})\\b`,
        "i",
      );
      const m = metin.match(re);
      if (!m) continue;
      sil(re, GUN_ADLARI[i][0]);
      const bugun = gunBasi(simdi);
      let fark = (i - haftaGunu(bugun) + 7) % 7;
      if (fark === 0) fark = 7;
      if (m[1]) fark += fark <= 7 && m[1].trim().length ? 0 : 0;
      tarih = gunEkle(bugun, fark);
      if (m[1] && fark < 7) tarih = gunEkle(tarih, 7);
      if (rrule?.startsWith("RRULE:FREQ=WEEKLY") && !rrule.includes("BYDAY")) {
        rrule = `RRULE:FREQ=WEEKLY;BYDAY=${GUN_KODU[i]}`;
      }
      break;
    }
  }

  if (!tarih && herGunAdi >= 0) {
    const bugun = gunBasi(simdi);
    const fark = (herGunAdi - haftaGunu(bugun) + 7) % 7;
    tarih = gunEkle(bugun, fark);
  }

  // ---- saat
  let dakika: number | null = null;
  const gunDilimi = (() => {
    if (sil(/\bsabah\b/i, "sabah")) return "sabah";
    if (sil(/\b[öo][ğg]len(?:i|leyin)?\b/i, "öğlen")) return "öğlen";
    if (sil(/\bak[şs]am\b/i, "akşam")) return "akşam";
    if (sil(/\bgece\b/i, "gece")) return "gece";
    return null;
  })();

  {
    const m = sil(/\b(?:saat\s*)?(\d{1,2})[:.](\d{2})\b/);
    if (m) {
      dakika = Number(m[1]) * 60 + Number(m[2]);
      ipuclari.push(`${m[1]}:${m[2]}`);
    }
  }
  if (dakika === null) {
    const m = sil(/\b(?:saat\s*)(\d{1,2})\b|\b(\d{1,2})\s*(?:'?d[ae]|te|ta)\b/i);
    if (m) {
      const h = Number(m[1] ?? m[2]);
      if (h <= 23) {
        dakika = h * 60;
        ipuclari.push(`${h}:00`);
      }
    }
  }
  if (dakika === null && gunDilimi) {
    dakika = { sabah: 9 * 60, öğlen: 12 * 60, akşam: 20 * 60, gece: 22 * 60 }[gunDilimi]!;
  }
  if (dakika !== null && gunDilimi === "akşam" && dakika < 12 * 60) dakika += 12 * 60;
  if (dakika !== null && gunDilimi === "gece" && dakika < 12 * 60) dakika += 12 * 60;

  // ---- birleştir
  const allDay = dakika === null;
  let start: Date;
  if (tarih) {
    start = new Date(tarih);
  } else if (dakika !== null) {
    // Saat verilmiş ama gün yok: bugün geçtiyse yarına at.
    start = gunBasi(simdi);
    if (dakika <= simdi.getHours() * 60 + simdi.getMinutes()) {
      start = gunEkle(start, 1);
    }
  } else {
    start = gunBasi(simdi);
  }
  if (dakika !== null) {
    start.setHours(Math.floor(dakika / 60), dakika % 60, 0, 0);
  }

  const end = allDay
    ? new Date(start)
    : new Date(start.getTime() + (sureDk ?? 60) * 60000);

  const title = metin
    .replace(/\s{2,}/g, " ")
    .replace(/^[-–—,;:.\s]+|[-–—,;:\s]+$/g, "")
    .trim();

  return {
    title: title || "Yeni etkinlik",
    start,
    end,
    allDay,
    rrule,
    ipuclari,
  };
}
