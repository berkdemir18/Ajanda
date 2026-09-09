export const AYLAR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
export const AYLAR_KISA = [
  "Oca", "Şub", "Mar", "Nis", "May", "Haz",
  "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
];
/** Pazartesi ilk gün. */
export const GUNLER = [
  "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar",
];
export const GUNLER_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/** 0 = Pazartesi … 6 = Pazar */
export function haftaGunu(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function gunBasi(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function gunSonu(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function haftaBasi(d: Date): Date {
  const x = gunBasi(d);
  x.setDate(x.getDate() - haftaGunu(x));
  return x;
}

export function ayBasi(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function ayGridBasi(d: Date): Date {
  return haftaBasi(ayBasi(d));
}

export function gunEkle(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function ayEkle(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const gun = Math.min(d.getDate(), ayGunSayisi(x.getFullYear(), x.getMonth()));
  x.setDate(gun);
  return x;
}

export function ayGunSayisi(yil: number, ay: number): number {
  return new Date(yil, ay + 1, 0).getDate();
}

export function ayniGun(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function bugunMu(d: Date): boolean {
  return ayniGun(d, new Date());
}

export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ymdCoz(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function saat(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "15:00" veya "9.30" → dakika cinsinden gün içi konum. */
export function saatCoz(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})[:.]?(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const dk = Number(m[2] ?? 0);
  if (h > 23 || dk > 59) return null;
  return h * 60 + dk;
}

/** Yerel saat dilimi ofsetiyle RFC3339: 2026-09-08T15:00:00+03:00 */
export function rfc3339(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const isaret = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:00` +
    `${isaret}${p(Math.floor(a / 60))}:${p(a % 60)}`
  );
}

export function dakikaEkle(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60000);
}

/** ISO 8601 hafta numarası. */
export function haftaNo(d: Date): number {
  const x = gunBasi(d);
  x.setDate(x.getDate() + 3 - haftaGunu(x));
  const ilk = new Date(x.getFullYear(), 0, 4);
  ilk.setDate(ilk.getDate() + 3 - haftaGunu(ilk));
  return 1 + Math.round((x.getTime() - ilk.getTime()) / (7 * 86400000));
}

export function tarihUzun(d: Date): string {
  return `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}, ${GUNLER[haftaGunu(d)]}`;
}

export function tarihKisa(d: Date): string {
  return `${d.getDate()} ${AYLAR_KISA[d.getMonth()]}`;
}

/** "bugün / yarın / 3 gün sonra" gibi insanca fark. */
export function goreliGun(d: Date): string {
  const fark = Math.round(
    (gunBasi(d).getTime() - gunBasi(new Date()).getTime()) / 86400000,
  );
  if (fark === 0) return "Bugün";
  if (fark === 1) return "Yarın";
  if (fark === -1) return "Dün";
  if (fark === 2) return "Öbür gün";
  if (fark > 0 && fark < 7) return `${fark} gün sonra`;
  if (fark < 0 && fark > -7) return `${-fark} gün önce`;
  return tarihKisa(d);
}

export function sureMetni(dk: number): string {
  if (dk < 60) return `${dk} dk`;
  const s = Math.floor(dk / 60);
  const k = dk % 60;
  if (k === 0) return `${s} saat`;
  return `${s} sa ${k} dk`;
}
