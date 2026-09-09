/**
 * Yalnızca `vite dev` tarayıcıda açıldığında devreye giren sahte arka uç.
 * Tauri penceresinde `__TAURI_INTERNALS__` zaten var, bu dosya hiç yüklenmez;
 * üretim derlemesinde de `import.meta.env.DEV` kapalı olduğu için elenir.
 */
import { gunEkle, rfc3339, ymd } from "./date";
import type { CalEvent, EventInput } from "./types";

const bugun = new Date();
const g = (gun: number, s: number, dk = 0) => {
  const d = gunEkle(bugun, gun);
  d.setHours(s, dk, 0, 0);
  return d;
};

let sayac = 0;
const yeni = (o: Partial<CalEvent>): CalEvent => ({
  id: `m${++sayac}`,
  calendarId: "birincil",
  googleId: `g${sayac}`,
  title: "Etkinlik",
  description: null,
  location: null,
  startAt: rfc3339(g(0, 10)),
  endAt: rfc3339(g(0, 11)),
  allDay: false,
  rrule: null,
  color: null,
  reminderMin: 15,
  status: "confirmed",
  recurringEventId: null,
  originalStart: null,
  done: false,
  updatedAt: Date.now(),
  ...o,
});

const takvimler = [
  {
    id: "birincil",
    summary: "Berk",
    description: null,
    color: "#58a8ea",
    isPrimary: true,
    accessRole: "owner",
    visible: true,
    isLocal: false,
    timeZone: "Europe/Istanbul",
    sortOrder: 0,
  },
  {
    id: "okul",
    summary: "Ostim YBS",
    description: null,
    color: "#f0a03c",
    isPrimary: false,
    accessRole: "owner",
    visible: true,
    isLocal: false,
    timeZone: "Europe/Istanbul",
    sortOrder: 1,
  },
  {
    id: "local",
    summary: "Yerel Takvim",
    description: null,
    color: "#7db86e",
    isPrimary: false,
    accessRole: "owner",
    visible: true,
    isLocal: true,
    timeZone: null,
    sortOrder: 100,
  },
];

const olaylar: CalEvent[] = [
  yeni({ title: "Veri Yapıları dersi", calendarId: "okul", startAt: rfc3339(g(0, 9)), endAt: rfc3339(g(0, 11)), location: "D-204", rrule: "RRULE:FREQ=WEEKLY" }),
  yeni({ title: "Spor", startAt: rfc3339(g(0, 18, 30)), endAt: rfc3339(g(0, 19, 30)), rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR" }),
  yeni({ title: "Kokpit v1.1 planlama", startAt: rfc3339(g(0, 14)), endAt: rfc3339(g(0, 15, 30)) }),
  yeni({ title: "Diş hekimi", startAt: rfc3339(g(1, 15)), endAt: rfc3339(g(1, 16)), location: "Etimesgut" }),
  yeni({ title: "MaçLab lig doğrulaması", startAt: rfc3339(g(1, 10)), endAt: rfc3339(g(1, 12)) }),
  yeni({ title: "F1 İspanya GP", calendarId: "local", allDay: true, startAt: ymd(gunEkle(bugun, 3)), endAt: ymd(gunEkle(bugun, 3)) }),
  yeni({ title: "Vize haftası", calendarId: "okul", allDay: true, startAt: ymd(gunEkle(bugun, 5)), endAt: ymd(gunEkle(bugun, 9)) }),
  yeni({ title: "Beşiktaş maçı", startAt: rfc3339(g(2, 20)), endAt: rfc3339(g(2, 22)) }),
  yeni({ title: "İngilizce çalışma", startAt: rfc3339(g(0, 21)), endAt: rfc3339(g(0, 22)), rrule: "RRULE:FREQ=DAILY" }),
  yeni({ title: "Aile görüşmesi", startAt: rfc3339(g(2, 14)), endAt: rfc3339(g(2, 15)) }),
  yeni({ title: "Proje teslimi", calendarId: "okul", startAt: rfc3339(g(4, 23, 45)), endAt: rfc3339(g(4, 23, 59)) }),
];

const ayarlar: Record<string, string> = { sync_interval_min: "5" };

async function invoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (cmd) {
    case "list_calendars":
      return takvimler;
    case "events_range":
      return { events: olaylar, cancelled: [] };
    case "all_events":
      return olaylar;
    case "auth_status":
      return {
        connected: true,
        email: "ornek@gmail.com",
        hasClient: true,
        lastSync: Date.now(),
        pending: 0,
      };
    case "get_settings":
      return ayarlar;
    case "set_setting":
      ayarlar[args.key as string] = args.value as string;
      return null;
    case "set_calendar_visible": {
      const c = takvimler.find((x) => x.id === args.id);
      if (c) c.visible = args.visible as boolean;
      return null;
    }
    case "set_calendar_color": {
      const c = takvimler.find((x) => x.id === args.id);
      if (c) c.color = args.color as string;
      return null;
    }
    case "save_event": {
      const g2 = args.input as EventInput;
      const mevcut = g2.id ? olaylar.find((e) => e.id === g2.id) : undefined;
      if (mevcut) {
        Object.assign(mevcut, g2, { updatedAt: Date.now() });
        return mevcut;
      }
      const e = yeni({ ...g2, id: `m${++sayac}`, googleId: null } as Partial<CalEvent>);
      olaylar.push(e);
      return e;
    }
    case "delete_event": {
      const i = olaylar.findIndex((e) => e.id === args.id);
      if (i >= 0) olaylar.splice(i, 1);
      return null;
    }
    case "toggle_done": {
      const e = olaylar.find((x) => x.id === args.id);
      if (e) e.done = args.done as boolean;
      return null;
    }
    case "sync_now":
      return { pushed: 0, pulled: 0, deleted: 0, calendars: 3, errors: [], at: Date.now() };
    case "db_path":
      return "(geliştirme modu — veritabanı yok)";
    default:
      return null;
  }
}

(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke,
  transformCallback: (cb: unknown) => cb,
};

console.info("Ajanda: sahte arka uç etkin (yalnızca geliştirme).");
