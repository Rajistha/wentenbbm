import { REGIONS } from "./regions";
import type { Place, StationStatus } from "./types";

export interface AreaSummary {
  regionId: number;
  name: string;
  total: number;
  available: number;
  limited: number;
  empty: number;
  unknown: number;
}

export interface FuelSummary {
  total: number;
  available: number;
  limited: number;
  empty: number;
  unknown: number;
  /** Tersedia + Terbatas: SPBU yang kemungkinan masih punya BBM. */
  withFuel: number;
  /** SPBU yang sudah ada kabarnya (bukan "belum ada kabar"). */
  reported: number;
  areas: AreaSummary[];
}

/** Ringkasan kondisi BBM se-Bali untuk gambar bagikan dan teks pesan. Hanya SPBU (bukan pengecer/terminal). */
export function summarizeFuel(places: Place[], statuses: Map<string, StationStatus>, areaLimit = 4): FuelSummary {
  const out: FuelSummary = { total: 0, available: 0, limited: 0, empty: 0, unknown: 0, withFuel: 0, reported: 0, areas: [] };
  const byRegion = new Map<number, AreaSummary>();
  for (const p of places) {
    if (p.kind !== "spbu") continue;
    const s = statuses.get(p.id)?.overall ?? "unknown";
    out.total++;
    out[s]++;
    if (p.regionId != null) {
      const name = REGIONS.find((r) => r.id === p.regionId)?.name.replace(/^Kota /, "") ?? "";
      const a = byRegion.get(p.regionId) ?? { regionId: p.regionId, name, total: 0, available: 0, limited: 0, empty: 0, unknown: 0 };
      a.total++;
      a[s]++;
      byRegion.set(p.regionId, a);
    }
  }
  out.withFuel = out.available + out.limited;
  out.reported = out.total - out.unknown;
  out.areas = [...byRegion.values()].sort((a, b) => b.total - a.total).slice(0, areaLimit);
  return out;
}

/** Batas wilayah Bali untuk memproyeksikan koordinat ke gambar. */
export const MAP_IMAGE_BOUNDS = { minLat: -8.95, maxLat: -8.05, minLng: 114.4, maxLng: 115.75 };

/** Proyeksi sederhana (cukup untuk pulau sekecil Bali): kembalikan posisi 0..1, y ke bawah. */
export function projectBali(lat: number, lng: number): { x: number; y: number } {
  const b = MAP_IMAGE_BOUNDS;
  return { x: (lng - b.minLng) / (b.maxLng - b.minLng), y: (b.maxLat - lat) / (b.maxLat - b.minLat) };
}
