import { GUNLER, gunEkle, haftaGunu, ymd, ymdCoz } from "./date";
import type { CalEvent, Occurrence } from "./types";

export interface Rrule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  byday: string[];      // ["MO","TU"] veya ["2TU"] (aylık sıralı)
  bymonthday: number[];
  count: number | null;
  until: Date | null;
}

const GUN_KODU = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function parseRrule(raw: string | null): Rrule | null {
  if (!raw) return null;
  const body = raw.replace(/^RRULE:/i, "").trim();
  if (!body) return null;
  const out: Rrule = {
    freq: "WEEKLY",
    interval: 1,
    byday: [],
    bymonthday: [],
    count: null,
    until: null,
  };
  let gorulenFreq = false;
  for (const parca of body.split(";")) {
    const [k, v] = parca.split("=");
    if (!k || v === undefined) continue;
    switch (k.toUpperCase()) {
      case "FREQ": {
        const f = v.toUpperCase();
        if (f === "DAILY" || f === "WEEKLY" || f === "MONTHLY" || f === "YEARLY") {
          out.freq = f;
          gorulenFreq = true;
        }
        break;
      }
      case "INTERVAL":
        out.interval = Math.max(1, Number(v) || 1);
        break;
      case "BYDAY":
        out.byday = v.toUpperCase().split(",").filter(Boolean);
        break;
      case "BYMONTHDAY":
        out.bymonthday = v.split(",").map(Number).filter((n) => !Number.isNaN(n));
        break;
      case "COUNT":
        out.count = Number(v) || null;
        break;
      case "UNTIL":
        out.until = untilCoz(v);
        break;
    }
  }
  return gorulenFreq ? out : null;
}

function untilCoz(v: string): Date | null {
  // 20261231T235959Z ya da 20261231
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59);
  if (z) {
    return new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    );
  }
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

export function buildRrule(r: Rrule): string {
  const p: string[] = [`FREQ=${r.freq}`];
  if (r.interval > 1) p.push(`INTERVAL=${r.interval}`);
  if (r.byday.length) p.push(`BYDAY=${r.byday.join(",")}`);
  if (r.bymonthday.length) p.push(`BYMONTHDAY=${r.bymonthday.join(",")}`);
  if (r.count) p.push(`COUNT=${r.count}`);
  if (r.until) {
    const p2 = (n: number) => String(n).padStart(2, "0");
    const u = r.until;
    p.push(
      `UNTIL=${u.getFullYear()}${p2(u.getMonth() + 1)}${p2(u.getDate())}T235959Z`,
    );
  }
  return `RRULE:${p.join(";")}`;
}

export function rruleMetni(raw: string | null): string {
  const r = parseRrule(raw);
  if (!r) return "Tekrar yok";
  const i = r.interval;
  let s: string;
  switch (r.freq) {
    case "DAILY":
      s = i === 1 ? "Her gün" : `${i} günde bir`;
      break;
    case "WEEKLY": {
      const gunler = r.byday
        .map((k) => GUNLER[GUN_KODU.indexOf(k.replace(/^[-\d]+/, ""))])
        .filter(Boolean);
      const bas = i === 1 ? "Her hafta" : `${i} haftada bir`;
      s = gunler.length ? `${bas} ${gunler.join(", ")}` : bas;
      break;
    }
    case "MONTHLY":
      s = i === 1 ? "Her ay" : `${i} ayda bir`;
      break;
    case "YEARLY":
      s = i === 1 ? "Her yıl" : `${i} yılda bir`;
      break;
  }
  if (r.count) s += `, ${r.count} kez`;
  if (r.until) s += `, ${ymd(r.until)} tarihine kadar`;
  return s;
}

/** Tekrar kuralını uygular; [from, to] penceresine düşen başlangıçları verir. */
function occurrenceStarts(
  baslangic: Date,
  r: Rrule,
  from: Date,
  to: Date,
): Date[] {
  const out: Date[] = [];
  const limit = r.until && r.until < to ? r.until : to;
  const maxAdim = 5000; // sonsuz döngüye karşı emniyet
  let uretilen = 0;

  const kabul = (d: Date) => {
    if (r.count !== null && uretilen >= r.count) return false;
    uretilen++;
    if (d >= from && d <= limit) out.push(new Date(d));
    return true;
  };

  // COUNT yoksa pencereye kadar olan tekrarları tek tek üretmeye gerek yok:
  // yıllar önce başlamış günlük bir alışkanlık adım sınırına takılıp
  // görünmez oluyordu. COUNT varsa sayacı bozmamak için atlama yapılmaz.
  const atla = (birimMs: number, bas: Date): Date => {
    if (r.count !== null || bas >= from) return new Date(bas);
    const adim = Math.floor((from.getTime() - bas.getTime()) / birimMs);
    return new Date(bas.getTime() + adim * birimMs);
  };

  if (r.freq === "DAILY") {
    const cur = atla(r.interval * 86400000, baslangic);
    // Atlama milisaniye aritmetiğiyle yapıldı; saat başına kayma olmasın.
    cur.setHours(baslangic.getHours(), baslangic.getMinutes(), 0, 0);
    for (let i = 0; i < maxAdim && cur <= limit; i++) {
      if (!kabul(cur)) break;
      cur.setDate(cur.getDate() + r.interval);
    }
    return out;
  }

  if (r.freq === "WEEKLY") {
    const kodlar = r.byday.length
      ? r.byday.map((k) => GUN_KODU.indexOf(k.replace(/^[-\d]+/, "")))
      : [haftaGunu(baslangic)];
    const haftaBas = gunEkle(baslangic, -haftaGunu(baslangic));
    const cur = atla(r.interval * 7 * 86400000, haftaBas);
    for (let w = 0; w < maxAdim && cur <= limit; w++) {
      for (const g of kodlar.slice().sort((a, b) => a - b)) {
        if (g < 0) continue;
        const d = gunEkle(cur, g);
        d.setHours(
          baslangic.getHours(),
          baslangic.getMinutes(),
          0,
          0,
        );
        if (d < baslangic) continue;
        if (d > limit) continue;
        if (!kabul(d)) return out;
      }
      cur.setDate(cur.getDate() + 7 * r.interval);
    }
    return out;
  }

  if (r.freq === "MONTHLY") {
    const sirali = r.byday.find((k) => /^-?\d/.test(k));
    const cur = new Date(baslangic.getFullYear(), baslangic.getMonth(), 1);
    for (let i = 0; i < maxAdim; i++) {
      const ayIlk = new Date(cur);
      if (ayIlk > limit) break;
      let d: Date | null = null;
      if (sirali) {
        // "2TU" = ayın 2. salısı, "-1FR" = son cuma
        const m = sirali.match(/^(-?\d+)([A-Z]{2})$/);
        if (m) {
          const n = Number(m[1]);
          const hedef = GUN_KODU.indexOf(m[2]);
          d = nthWeekday(ayIlk.getFullYear(), ayIlk.getMonth(), hedef, n);
        }
      } else {
        const gun = r.bymonthday[0] ?? baslangic.getDate();
        const sonGun = new Date(ayIlk.getFullYear(), ayIlk.getMonth() + 1, 0).getDate();
        if (gun <= sonGun) {
          d = new Date(ayIlk.getFullYear(), ayIlk.getMonth(), gun);
        }
      }
      if (d) {
        d.setHours(baslangic.getHours(), baslangic.getMinutes(), 0, 0);
        if (d >= baslangic && d <= limit) {
          if (!kabul(d)) return out;
        } else if (d >= baslangic) {
          if (!kabul(d)) return out;
        }
      }
      cur.setMonth(cur.getMonth() + r.interval);
    }
    return out;
  }

  // YEARLY
  const cur = new Date(baslangic);
  for (let i = 0; i < maxAdim && cur <= limit; i++) {
    if (!kabul(cur)) break;
    cur.setFullYear(cur.getFullYear() + r.interval);
  }
  return out;
}

function nthWeekday(yil: number, ay: number, hedef: number, n: number): Date | null {
  if (hedef < 0) return null;
  if (n > 0) {
    const ilk = new Date(yil, ay, 1);
    const kaydir = (hedef - haftaGunu(ilk) + 7) % 7;
    const gun = 1 + kaydir + (n - 1) * 7;
    if (gun > new Date(yil, ay + 1, 0).getDate()) return null;
    return new Date(yil, ay, gun);
  }
  const son = new Date(yil, ay + 1, 0);
  const kaydir = (haftaGunu(son) - hedef + 7) % 7;
  const gun = son.getDate() - kaydir + (n + 1) * 7;
  if (gun < 1) return null;
  return new Date(yil, ay, gun);
}

export function evStart(e: CalEvent): Date {
  return e.allDay ? ymdCoz(e.startAt) : new Date(e.startAt);
}

export function evEnd(e: CalEvent): Date {
  if (e.allDay) {
    const d = ymdCoz(e.endAt);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return new Date(e.endAt);
}

/**
 * Ham olay listesini ekrana çizilebilir kutulara açar: tekrarları üretir,
 * iptal edilen tekrarları ve taşınmış tekrarları atlar.
 */
export function expand(
  events: CalEvent[],
  cancelled: [string, string][],
  from: Date,
  to: Date,
): Occurrence[] {
  // Ana kaydın hangi tekrarları elle değiştirilmiş / iptal edilmiş?
  const istisna = new Map<string, Set<number>>();
  const ekle = (masterGid: string, orijinal: string) => {
    const t = new Date(orijinal).getTime();
    if (Number.isNaN(t)) return;
    if (!istisna.has(masterGid)) istisna.set(masterGid, new Set());
    istisna.get(masterGid)!.add(t);
  };
  for (const [gid, orig] of cancelled) ekle(gid, orig);
  for (const e of events) {
    if (e.recurringEventId && e.originalStart) ekle(e.recurringEventId, e.originalStart);
  }

  const out: Occurrence[] = [];
  for (const e of events) {
    const bas = evStart(e);
    const bit = evEnd(e);
    const sure = Math.max(0, bit.getTime() - bas.getTime());
    const r = parseRrule(e.rrule);

    if (!r) {
      if (bit >= from && bas <= to) {
        out.push({ key: e.id, event: e, start: bas, end: bit, repeated: false });
      }
      continue;
    }

    // Pencereden önce başlayan uzun olaylar da görünsün diye biraz geriden tara.
    const tarama = new Date(from.getTime() - sure - 86400000);
    const atlanacak = e.googleId ? istisna.get(e.googleId) : undefined;

    for (const s of occurrenceStarts(bas, r, tarama, to)) {
      if (atlanacak?.has(s.getTime())) continue;
      const son = new Date(s.getTime() + sure);
      if (son < from || s > to) continue;
      out.push({
        key: `${e.id}@${s.getTime()}`,
        event: e,
        start: s,
        end: son,
        repeated: true,
      });
    }
  }

  out.sort((a, b) => {
    if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
    return a.start.getTime() - b.start.getTime();
  });
  return out;
}
