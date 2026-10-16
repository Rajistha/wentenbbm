import type {
  BrandType,
  FuelStatus,
  FuelType,
  Place,
  PlaceKind,
  PlacesSnapshot,
  QueueLevel,
  StationStatus,
  StatusSnapshot,
  SummaryCounts,
} from "./types";

// Format array ringkas sesuai ARCHITECTURE.md bagian 3.1.

export type FuelTypeTuple = [number, string, string, BrandType, boolean];
export type PlaceTuple = [
  string, // id
  string, // slug
  PlaceKind,
  BrandType,
  string | null, // spbu_code
  string, // name
  number, // lat
  number, // lng
  number | null, // region_id
  boolean, // is_24h
  number[], // fuel_type_ids
  (string | null)?, // address
  boolean?, // ditambahkan warga
];
export type FuelStatusTuple = [number, FuelStatus, boolean, string | null];
export type StationStatusTuple = [
  string,
  FuelStatus,
  boolean,
  QueueLevel | null,
  number | null,
  number | null,
  string | null,
  FuelStatusTuple[],
  number?, // laporan 3 jam terakhir
  number?, // sedang antre
];

export interface PlacesPayload {
  v: number;
  generated_at: string;
  fuel_types: FuelTypeTuple[];
  places: PlaceTuple[];
}

export interface StatusPayload {
  generated_at: string;
  online_now: number;
  reports_total: number;
  /** Laporan aktif dalam 24 jam terakhir (migrasi 0011). */
  reports_24h?: number;
  /** Orang yang sedang mengantre se-Bali (migrasi 0014). */
  queuing_now?: number;
  summary: Record<string, SummaryCounts>;
  stations: StationStatusTuple[];
}

export function decodePlaces(p: PlacesPayload): PlacesSnapshot {
  return {
    v: p.v,
    generatedAt: p.generated_at,
    fuelTypes: p.fuel_types.map(([id, code, name, brand, isFilterTab]) => ({
      id,
      code,
      name,
      brand,
      isFilterTab,
    })),
    places: p.places.map(decodePlace),
  };
}

export function decodePlace(t: PlaceTuple): Place {
  const [id, slug, kind, brand, code, name, lat, lng, regionId, is24h, fuelIds, address, byUser] = t;
  return { id, slug, kind, brand, code, name, lat, lng, regionId, is24h, fuelIds, address: address ?? null, ...(byUser ? { byUser: true } : {}) };
}

export function encodePlace(p: Place): PlaceTuple {
  return [p.id, p.slug, p.kind, p.brand, p.code, p.name, p.lat, p.lng, p.regionId, p.is24h, p.fuelIds, p.address, !!p.byUser];
}

export function encodeFuelType(f: FuelType): FuelTypeTuple {
  return [f.id, f.code, f.name, f.brand, f.isFilterTab];
}

export function decodeStationStatus(t: StationStatusTuple): StationStatus {
  const [id, overall, confirmed, queue, waitLow, waitHigh, lastReportAt, fuels, reports3h, queuing] = t;
  return {
    id,
    overall,
    confirmed,
    queue,
    waitLow,
    waitHigh,
    lastReportAt,
    ...(reports3h != null ? { reports3h } : {}),
    ...(queuing != null ? { queuing } : {}),
    fuels: fuels.map(([fuelTypeId, status, c, at]) => ({
      fuelTypeId,
      status,
      confirmed: c,
      lastReportAt: at,
    })),
  };
}

export function encodeStationStatus(s: StationStatus): StationStatusTuple {
  return [
    s.id,
    s.overall,
    s.confirmed,
    s.queue,
    s.waitLow,
    s.waitHigh,
    s.lastReportAt,
    s.fuels.map((f) => [f.fuelTypeId, f.status, f.confirmed, f.lastReportAt]),
    ...(s.reports3h != null ? [s.reports3h] : []),
    ...(s.queuing != null ? [s.queuing] : []),
  ] as StationStatusTuple;
}

export function decodeStatus(p: StatusPayload): StatusSnapshot {
  return {
    generatedAt: p.generated_at,
    onlineNow: p.online_now,
    reportsTotal: p.reports_total,
    summary: p.summary,
    stations: new Map(p.stations.map((t) => [t[0], decodeStationStatus(t)])),
  };
}
