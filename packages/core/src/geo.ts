export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Jarak lurus (haversine) dalam meter. */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Pusat peta bawaan saat lokasi ditolak (Denpasar). */
export const DENPASAR: LatLng = { lat: -8.6705, lng: 115.2126 };

/** Batas kasar Pulau Bali (termasuk Nusa Penida). */
export const BALI_BOUNDS: [[number, number], [number, number]] = [
  [114.4, -8.88],
  [115.75, -8.03],
];

export function googleMapsDirUrl(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
}

/**
 * Buka pencarian Google Maps ("SPBU Pertamina") berpusat di titik ini, zoom 18.
 * Berguna bila koordinat dari OpenStreetMap meleset beberapa meter: pengguna memilih
 * tempat SPBU yang benar dari daftar Google lalu menekan Rute di sana.
 */
export function googleMapsSearchNearUrl(p: LatLng, query: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(query).replace(/%20/g, "+")}/@${p.lat},${p.lng},18z`;
}

export function geoUri(p: LatLng, label: string): string {
  return `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}(${encodeURIComponent(label)})`;
}
