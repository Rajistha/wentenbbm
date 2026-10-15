import { distanceM, type LatLng } from "./geo";
import { searchStations } from "./search";
import type { FuelStatus, Place, StationStatus, SummaryCounts } from "./types";

/** "all" atau id jenis BBM. */
export type FuelFilter = "all" | number;

const STATUS_RANK: Record<FuelStatus, number> = { available: 0, limited: 1, empty: 2, unknown: 3 };

export function statusRank(s: FuelStatus) {
  return STATUS_RANK[s];
}

/** Status yang dipakai penanda: keseluruhan, atau status jenis BBM yang difilter. */
export function effectiveStatus(
  status: StationStatus | undefined,
  filter: FuelFilter,
): { status: FuelStatus; confirmed: boolean; lastReportAt: string | null } {
  if (!status) return { status: "unknown", confirmed: false, lastReportAt: null };
  if (filter === "all") {
    return { status: status.overall, confirmed: status.confirmed, lastReportAt: status.lastReportAt };
  }
  const f = status.fuels.find((x) => x.fuelTypeId === filter);
  if (!f) return { status: "unknown", confirmed: false, lastReportAt: null };
  return { status: f.status, confirmed: f.confirmed && f.status !== "unknown", lastReportAt: f.lastReportAt };
}

export function sellsFuel(place: Place, filter: FuelFilter) {
  return filter === "all" || place.fuelIds.includes(filter);
}

export interface NearestResult {
  place: Place;
  distanceM: number;
  status: FuelStatus;
  /** true jika tidak ada yang Tersedia dalam 15 km lalu jatuh ke Terbatas (US-10). */
  fellBackToLimited: boolean;
}

/** US-10: SPBU Tersedia terdekat, jika tidak ada dalam 15 km pilih Terbatas. */
export function nearestWithFuel(
  from: LatLng,
  places: Place[],
  statuses: Map<string, StationStatus>,
  filter: FuelFilter,
  radiusM = 15000,
): NearestResult | null {
  let bestAvail: { place: Place; d: number } | null = null;
  let bestLimited: { place: Place; d: number } | null = null;
  for (const p of places) {
    if (p.kind === "terminal" || !sellsFuel(p, filter)) continue;
    const s = effectiveStatus(statuses.get(p.id), filter).status;
    if (s !== "available" && s !== "limited") continue;
    const d = distanceM(from, p);
    if (s === "available" && (!bestAvail || d < bestAvail.d)) bestAvail = { place: p, d };
    if (s === "limited" && (!bestLimited || d < bestLimited.d)) bestLimited = { place: p, d };
  }
  if (bestAvail && bestAvail.d <= radiusM) {
    return { place: bestAvail.place, distanceM: bestAvail.d, status: "available", fellBackToLimited: false };
  }
  if (bestLimited && bestLimited.d <= radiusM) {
    return { place: bestLimited.place, distanceM: bestLimited.d, status: "limited", fellBackToLimited: true };
  }
  if (bestAvail) {
    return { place: bestAvail.place, distanceM: bestAvail.d, status: "available", fellBackToLimited: false };
  }
  return null;
}

/** Hitung ringkasan [tersedia, terbatas, habis, belum ada] untuk SPBU yang terlihat. */
export function countStatuses(
  places: Place[],
  statuses: Map<string, StationStatus>,
  filter: FuelFilter,
): SummaryCounts {
  const c: SummaryCounts = [0, 0, 0, 0];
  for (const p of places) {
    if (p.kind !== "spbu" || !sellsFuel(p, filter)) continue;
    c[STATUS_RANK[effectiveStatus(statuses.get(p.id), filter).status]]++;
  }
  return c;
}

export function searchPlaces(places: Place[], q: string, regionNames: Record<number, string>): Place[] {
  if (!q.trim()) return places;
  return searchStations(places, q, regionNames).map((h) => h.place);
}
