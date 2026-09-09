import { invoke } from "@tauri-apps/api/core";
import type {
  AuthStatus,
  CalEvent,
  Calendar,
  EventInput,
  SyncResult,
} from "./types";

export const api = {
  calendars: () => invoke<Calendar[]>("list_calendars"),

  setCalendarVisible: (id: string, visible: boolean) =>
    invoke<void>("set_calendar_visible", { id, visible }),

  setCalendarColor: (id: string, color: string) =>
    invoke<void>("set_calendar_color", { id, color }),

  eventsRange: (min: string, max: string) =>
    invoke<{ events: CalEvent[]; cancelled: [string, string][] }>(
      "events_range",
      { min, max },
    ),

  allEvents: () => invoke<CalEvent[]>("all_events"),

  saveEvent: (input: EventInput) => invoke<CalEvent>("save_event", { input }),

  deleteEvent: (id: string) => invoke<void>("delete_event", { id }),

  toggleDone: (id: string, done: boolean) =>
    invoke<void>("toggle_done", { id, done }),

  settings: () => invoke<Record<string, unknown>>("get_settings"),

  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),

  authStatus: () => invoke<AuthStatus>("auth_status"),

  login: () => invoke<string>("auth_login"),

  logout: () => invoke<void>("auth_logout"),

  sync: () => invoke<SyncResult>("sync_now"),

  setReminders: (
    items: { key: string; at: number; title: string; body: string }[],
  ) => invoke<void>("set_reminders", { items }),

  dbPath: () => invoke<string>("db_path"),
};
