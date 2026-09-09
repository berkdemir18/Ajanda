import { api } from "./api";
import {
  ayBasi,
  ayEkle,
  gunBasi,
  gunEkle,
  gunSonu,
  haftaBasi,
  rfc3339,
  ymd,
} from "./date";
import { expand } from "./recur";
import type {
  AuthStatus,
  CalEvent,
  Calendar,
  Occurrence,
  ViewName,
} from "./types";

interface State {
  view: ViewName;
  anchor: Date;
  calendars: Calendar[];
  rawEvents: CalEvent[];
  cancelled: [string, string][];
  occurrences: Occurrence[];
  auth: AuthStatus;
  settings: Record<string, unknown>;
  yukleniyor: boolean;
  senkron: "bos" | "calisiyor" | "hata";
  senkronNot: string;
}

type Dinleyici = () => void;

const dinleyiciler = new Set<Dinleyici>();

export const state: State = {
  view: (localStorage.getItem("view") as ViewName) || "hafta",
  anchor: new Date(),
  calendars: [],
  rawEvents: [],
  cancelled: [],
  occurrences: [],
  auth: {
    connected: false,
    email: null,
    hasClient: false,
    lastSync: null,
    pending: 0,
  },
  settings: {},
  yukleniyor: true,
  senkron: "bos",
  senkronNot: "",
};

export function abone(fn: Dinleyici): () => void {
  dinleyiciler.add(fn);
  return () => dinleyiciler.delete(fn);
}

export function ciz(): void {
  for (const fn of dinleyiciler) fn();
}

export function gorunumAyarla(v: ViewName): void {
  state.view = v;
  localStorage.setItem("view", v);
  void yukle();
}

export function tariheGit(d: Date): void {
  state.anchor = d;
  void yukle();
}

/** Görünüme göre ekranda gösterilen aralık. */
export function aralik(): { bas: Date; bit: Date } {
  const a = state.anchor;
  switch (state.view) {
    case "gun":
      return { bas: gunBasi(a), bit: gunSonu(a) };
    case "hafta": {
      const bas = haftaBasi(a);
      return { bas, bit: gunSonu(gunEkle(bas, 6)) };
    }
    case "ay": {
      const bas = ayBasi(a);
      return { bas, bit: gunSonu(new Date(a.getFullYear(), a.getMonth() + 1, 0)) };
    }
    case "yil":
      return {
        bas: new Date(a.getFullYear(), 0, 1),
        bit: gunSonu(new Date(a.getFullYear(), 11, 31)),
      };
    case "program":
      return { bas: gunBasi(a), bit: gunSonu(gunEkle(a, 60)) };
  }
}

/** Veritabanından çekilen aralık — görünenden geniş, gezinme takılmasın. */
function yuklemeAraligi(): { min: string; max: string } {
  const { bas, bit } = aralik();
  return {
    min: rfc3339(gunBasi(ayEkle(bas, -2))),
    max: rfc3339(gunSonu(ayEkle(bit, 2))),
  };
}

export function gorunurTakvimler(): Set<string> {
  return new Set(state.calendars.filter((c) => c.visible).map((c) => c.id));
}

export function takvimRengi(e: CalEvent): string {
  if (e.color) return e.color;
  const c = state.calendars.find((x) => x.id === e.calendarId);
  return c?.color ?? "#5b8def";
}

export function takvimAdi(id: string): string {
  return state.calendars.find((x) => x.id === id)?.summary ?? "Takvim";
}

let yuklemeSirasi = 0;

export async function yukle(): Promise<void> {
  const sira = ++yuklemeSirasi;
  const { min, max } = yuklemeAraligi();
  try {
    const [cals, veri, auth] = await Promise.all([
      api.calendars(),
      api.eventsRange(min, max),
      api.authStatus(),
    ]);
    if (sira !== yuklemeSirasi) return; // daha yeni bir yükleme var
    state.calendars = cals;
    state.rawEvents = veri.events;
    state.cancelled = veri.cancelled;
    state.auth = auth;
    hesapla();
  } catch (e) {
    state.senkron = "hata";
    state.senkronNot = String(e);
  } finally {
    if (sira === yuklemeSirasi) state.yukleniyor = false;
    ciz();
  }
}

export function hesapla(): void {
  const gorunur = gorunurTakvimler();
  const { bas, bit } = aralik();
  const olaylar = state.rawEvents.filter((e) => gorunur.has(e.calendarId));
  state.occurrences = expand(
    olaylar,
    state.cancelled,
    gunBasi(ayEkle(bas, -1)),
    gunSonu(ayEkle(bit, 1)),
  );
  void hatirlaticilariGonder();
}

/** Önümüzdeki 48 saatin hatırlatıcılarını arka plana bildirir. */
async function hatirlaticilariGonder(): Promise<void> {
  try {
    const simdi = new Date();
    const son = new Date(simdi.getTime() + 48 * 3600 * 1000);
    const gorunur = gorunurTakvimler();
    const liste = expand(
      state.rawEvents.filter(
        (e) => gorunur.has(e.calendarId) && e.reminderMin !== null,
      ),
      state.cancelled,
      simdi,
      son,
    );
    const items = liste
      .map((o) => {
        const dk = o.event.reminderMin ?? 0;
        const at = o.start.getTime() - dk * 60000;
        const saat = o.event.allDay
          ? "tüm gün"
          : o.start.toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            });
        const yer = o.event.location ? ` · ${o.event.location}` : "";
        return {
          key: o.key,
          at,
          title: o.event.title || "Etkinlik",
          body: dk === 0 ? `Şimdi · ${saat}${yer}` : `${dk} dk sonra · ${saat}${yer}`,
        };
      })
      .filter((r) => r.at > simdi.getTime() - 5 * 60000);
    await api.setReminders(items);
  } catch {
    // hatırlatıcı gönderilemezse arayüz çalışmaya devam etsin
  }
}

export async function senkronize(sessiz = false): Promise<void> {
  if (state.senkron === "calisiyor") return;
  state.senkron = "calisiyor";
  if (!sessiz) ciz();
  try {
    const r = await api.sync();
    state.senkron = r.errors.length ? "hata" : "bos";
    state.senkronNot = r.errors.length
      ? r.errors[0]
      : `${r.pulled} güncellendi · ${r.pushed} gönderildi`;
    await yukle();
  } catch (e) {
    state.senkron = "hata";
    state.senkronNot = String(e);
    ciz();
  }
}

export function gunlukOlaylar(gun: Date): Occurrence[] {
  const b = gunBasi(gun).getTime();
  const s = gunSonu(gun).getTime();
  return state.occurrences.filter(
    (o) => o.end.getTime() >= b && o.start.getTime() <= s,
  );
}

export function gunAnahtari(d: Date): string {
  return ymd(d);
}
