import { ageMinutes } from "./format";
import { distanceM, type LatLng } from "./geo";
import { effectiveStatus, sellsFuel, type FuelFilter } from "./stations";
import type { Place, StationStatus } from "./types";

export interface RankedPlace {
  place: Place;
  status: ReturnType<typeof effectiveStatus>;
  distanceM: number | null;
  score: number;
}

const QUEUE_PENALTY = { none: 0, short: 6, medium: 16, long: 30 } as const;

/**
 * "Rekomendasi terbaik": SPBU yang kemungkinan besar ada BBM, belum penuh antrean, dan tidak terlalu jauh.
 * Skor lebih kecil = lebih baik. Hanya SPBU berstatus Tersedia/Terbatas yang diperingkat.
 * - jarak: 1 poin per 500 m (maks 40)
 * - Terbatas: +18
 * - antrean: 0 / 6 / 16 / 30 menurut tingkat; antrean berjalan +1 per 3 orang (maks 10)
 * - kebaruan laporan: +0 sampai +20 menurut umur (kurang dari 15 mnt tanpa tambahan)
 * - terkonfirmasi: -8
 * - laporan terlalu sedikit (<3 dalam 3 jam, bila angkanya diketahui): +6
 */
export function bestBets(
  places: Place[],
  statuses: Map<string, StationStatus>,
  from: LatLng | null,
  filter: FuelFilter,
  limit = 5,
  now = Date.now(),
): RankedPlace[] {
  const out: RankedPlace[] = [];
  for (const place of places) {
    if (place.kind === "terminal" || !sellsFuel(place, filter)) continue;
    const st = statuses.get(place.id);
    const e = effectiveStatus(st, filter);
    if (e.status !== "available" && e.status !== "limited") continue;
    const d = from ? distanceM(from, place) : null;
    const age = ageMinutes(e.lastReportAt, now) ?? 120;
    let score = d == null ? 20 : Math.min(40, d / 500);
    if (e.status === "limited") score += 18;
    if (st?.queue) score += QUEUE_PENALTY[st.queue];
    if (st?.queuing) score += Math.min(10, st.queuing / 3);
    score += Math.min(20, Math.max(0, (age - 15) / 6));
    if (e.confirmed) score -= 8;
    if (st?.reports3h != null && st.reports3h < 3) score += 6;
    out.push({ place, status: e, distanceM: d, score });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, limit);
}

export interface RegionNeed {
  regionId: number;
  total: number;
  /** SPBU tanpa kabar segar (belum pernah dilaporkan atau laporan lebih dari 2 jam). */
  stale: number;
}

const FRESH_MIN = 120;

/** Wilayah yang paling butuh laporan: urut jumlah SPBU tanpa kabar, hanya SPBU (bukan pengecer/terminal). */
export function regionNeeds(places: Place[], statuses: Map<string, StationStatus>, now = Date.now()): RegionNeed[] {
  const by = new Map<number, RegionNeed>();
  for (const p of places) {
    if (p.kind !== "spbu" || p.regionId == null) continue;
    const row = by.get(p.regionId) ?? { regionId: p.regionId, total: 0, stale: 0 };
    row.total++;
    const s = statuses.get(p.id);
    const age = ageMinutes(s?.lastReportAt, now);
    if (!s || s.overall === "unknown" || age == null || age > FRESH_MIN) row.stale++;
    by.set(p.regionId, row);
  }
  return [...by.values()].filter((r) => r.stale > 0).sort((a, b) => b.stale / b.total - a.stale / a.total || b.stale - a.stale);
}
