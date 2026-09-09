export interface Calendar {
  id: string;
  summary: string;
  description: string | null;
  color: string;
  isPrimary: boolean;
  accessRole: string;
  visible: boolean;
  isLocal: boolean;
  timeZone: string | null;
  sortOrder: number;
}

export interface CalEvent {
  id: string;
  calendarId: string;
  googleId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  /** Zamanlı: RFC3339. Tüm gün: "YYYY-MM-DD" (bitiş dahil son gün). */
  startAt: string;
  endAt: string;
  allDay: boolean;
  rrule: string | null;
  color: string | null;
  reminderMin: number | null;
  status: string;
  recurringEventId: string | null;
  originalStart: string | null;
  done: boolean;
  updatedAt: number;
}

export interface EventInput {
  id?: string | null;
  calendarId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  rrule?: string | null;
  color?: string | null;
  reminderMin?: number | null;
  done?: boolean | null;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  deleted: number;
  calendars: number;
  errors: string[];
  at: number;
}

export interface AuthStatus {
  connected: boolean;
  email: string | null;
  hasClient: boolean;
  lastSync: number | null;
  pending: number;
}

/** Tekrarlar açıldıktan sonra ekrana çizilen tek bir kutu. */
export interface Occurrence {
  key: string;
  event: CalEvent;
  start: Date;
  end: Date;
  /** Ana kaydın tekrarından üretildiyse true. */
  repeated: boolean;
}

export type ViewName = "gun" | "hafta" | "ay" | "yil" | "program";
