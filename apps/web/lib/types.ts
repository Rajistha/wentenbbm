import type { StatusPayload } from "@wenten/core";

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  level: "info" | "important";
  region_id: number | null;
  ends_at: string;
}

/** Isi /api/status: format ARCHITECTURE.md 3.1 plus pengumuman dan sakelar baca-saja. */
export interface StatusResponse extends StatusPayload {
  read_only: boolean;
  visitors_total?: number;
  announcements: AnnouncementRow[];
  demo?: boolean;
}

export interface DashboardPayload {
  generated_at: string;
  launched_at: string;
  visitors_total: number;
  online_now: number;
  reports_accepted: number;
  reporters_unique: number;
  stations_fresh: number;
  stations_total: number;
  /** [jam, ada, terbatas, habis, laporan diterima, median tunggu] */
  hourly: [string, number, number, number, number, number | null][];
  /** [region_id, fuel_type_id, ada, terbatas, habis, belum] */
  regions: [number, number, number, number, number, number][];
  /** [jam, cek ok, total cek] */
  uptime: [string, number, number][];
  incidents: { id: string; kind: "spam" | "partial" | "down" | "maintenance"; started_at: string; ended_at: string | null; title: string; body: string }[];
  rejections_24h: {
    out_of_range: number;
    rate_limit: number;
    other: number;
    quarantined_reports: number;
    quarantined_places: number;
  };
  demo?: boolean;
}
