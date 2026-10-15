import { distanceM, type LatLng } from "./geo";

/** Arah (derajat 0-360, utara = 0) dari titik a ke titik b. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Selisih sudut terkecil antara dua arah (0-180). */
export function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export interface StreetImage {
  id: string;
  url: string;
  lat: number;
  lng: number;
  /** Arah kamera (derajat), kosong bila tidak diketahui. */
  heading: number | null;
  /** ms sejak epoch */
  capturedAt: number | null;
  author: string | null;
  isPano?: boolean;
}

export interface PickOptions {
  minDistanceM?: number;
  maxDistanceM?: number;
  maxAngleDeg?: number;
  /** Skor maksimum yang diterima; di atas ini dianggap tidak relevan. */
  maxScore?: number;
  now?: number;
}

/**
 * Pilih foto jalan yang paling mungkin memperlihatkan SPBU: kamera berada 5-60 m dari titik
 * SPBU dan menghadap ke arahnya (≤35°). Foto panorama dan foto tanpa arah kamera dilewati.
 * Mengembalikan null daripada foto yang tidak relevan.
 */
export function pickFacingImage(images: StreetImage[], target: LatLng, opts: PickOptions = {}): StreetImage | null {
  const { minDistanceM = 5, maxDistanceM = 60, maxAngleDeg = 35, maxScore = 65, now = Date.now() } = opts;
  let best: { img: StreetImage; score: number } | null = null;
  for (const img of images) {
    if (img.isPano || img.heading == null) continue;
    const d = distanceM(img, target);
    if (d < minDistanceM || d > maxDistanceM) continue;
    const diff = angleDiff(bearingDeg(img, target), img.heading);
    if (diff > maxAngleDeg) continue;
    const years = img.capturedAt ? Math.max(0, (now - img.capturedAt) / (365 * 24 * 3600_000)) : 5;
    // Lebih kecil lebih baik: sudut pas, dekat, dan baru.
    // Penalti sudut dinaikkan agar foto yang miring terhadap SPBU dibuang.
    const score = diff * 2.0 + d * 0.5 + Math.min(years, 8) * 3;
    if (!best || score < best.score) best = { img, score };
  }
  // Buang foto terbaik jika skor-nya masih terlalu buruk
  if (best && best.score > maxScore) return null;
  return best?.img ?? null;
}
