// Tipe domain bersama. Nilai enum sama persis dengan enum Postgres di ERD.md.

export type FuelStatus = "available" | "limited" | "empty" | "unknown";
export type FuelAvailability = Exclude<FuelStatus, "unknown">;
export type QueueLevel = "none" | "short" | "medium" | "long";
export type VoteType = "confirm" | "dispute";
export type PlaceKind = "spbu" | "pertashop" | "retailer" | "terminal";
export type BrandType = "pertamina" | "shell" | "bp" | "vivo" | "other" | "none";
export type Locale = "id" | "en";

export const FUEL_STATUSES: FuelStatus[] = ["available", "limited", "empty", "unknown"];
export const QUEUE_LEVELS: QueueLevel[] = ["none", "short", "medium", "long"];

export interface FuelType {
  id: number;
  code: string;
  name: string;
  brand: BrandType;
  isFilterTab: boolean;
}

export interface Place {
  id: string;
  slug: string;
  kind: PlaceKind;
  brand: BrandType;
  code: string | null;
  name: string;
  lat: number;
  lng: number;
  regionId: number | null;
  is24h: boolean;
  fuelIds: number[];
  address: string | null;
}

export interface FuelStatusEntry {
  fuelTypeId: number;
  status: FuelStatus;
  confirmed: boolean;
  lastReportAt: string | null;
}

export interface StationStatus {
  id: string;
  overall: FuelStatus;
  confirmed: boolean;
  queue: QueueLevel | null;
  waitLow: number | null;
  waitHigh: number | null;
  lastReportAt: string | null;
  fuels: FuelStatusEntry[];
}

/** Ringkasan se-Bali per jenis BBM: [tersedia, terbatas, habis, belum ada laporan]. */
export type SummaryCounts = [number, number, number, number];

export interface StatusSnapshot {
  generatedAt: string;
  onlineNow: number;
  reportsTotal: number;
  summary: Record<string, SummaryCounts>;
  stations: Map<string, StationStatus>;
}

export interface PlacesSnapshot {
  v: number;
  generatedAt: string;
  fuelTypes: FuelType[];
  places: Place[];
}

/** Laporan publik dari station_recent_reports(), tanpa kolom sensitif. */
export interface PublicReport {
  id: string;
  createdAt: string;
  items: { fuelTypeId: number; availability: FuelAvailability }[];
  queue: QueueLevel | null;
  waitMinutes: number | null;
  note: string | null;
  confirms: number;
  disputes: number;
  isMine: boolean;
  myVote: VoteType | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  level: "info" | "important";
  regionId: number | null;
  endsAt: string;
}

export type RpcErrorCode =
  | "AUTH_REQUIRED"
  | "READ_ONLY"
  | "BLOCKED"
  | "STATION_NOT_FOUND"
  | "LOW_ACCURACY"
  | "OUT_OF_RANGE"
  | "RATE_LIMIT_STATION"
  | "RATE_LIMIT_HOURLY"
  | "INVALID_ITEMS"
  | "REPORT_NOT_FOUND"
  | "OWN_REPORT"
  | "ALREADY_VOTED"
  | "OUT_OF_BOUNDS"
  | "TOO_CLOSE"
  | "PLACE_LIMIT"
  | "INVALID_PLACE"
  | "NETWORK";

export type RpcResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; code: RpcErrorCode; distance_m?: number; near_name?: string };
