import { googleMapsDirUrl } from "./geo";
import { REGION_NAMES } from "./regions";
import type { Place } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Satukan potongan teks tanpa mengulang kata yang sudah ada ("Dauh Puri Kaja" tidak muncul dua kali). */
function joinUnique(parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    const words = part.trim().split(/\s+/);
    const fresh = words.filter((w) => !seen.has(norm(w)) || /^\d/.test(w));
    for (const w of words) seen.add(norm(w));
    if (fresh.length) out.push(fresh.join(" "));
  }
  return out.join(" ");
}

/**
 * Teks pencarian Google Maps untuk satu SPBU: nama, nomor, jalan, kelurahan, dan kabupaten.
 * Contoh: "SPBU Pertamina 54.801.35 Dauh Puri Kaja Jalan Bypass Gatot Subroto Kota Denpasar Bali".
 */
export function stationSearchQuery(p: Place): string {
  const region = p.regionId != null ? REGION_NAMES[p.regionId] : undefined;
  const addr = p.address ?? "";
  const near = addr.startsWith("Dekat ");
  const cut = addr.lastIndexOf(",");
  const street = !near && cut > 0 ? addr.slice(0, cut).replace(/\s+\d+[a-z]?$/i, "") : "";
  const locality = near ? addr.slice(6) : cut > 0 ? addr.slice(cut + 1) : "";
  // Angka di belakang nama hanya pembeda internal ("SPBU Kapal 2"), bukan bagian nama sebenarnya
  const baseName = p.name.replace(/\s+\d+$/, "").replace(/^(SPBU|Pengecer|Pertashop)\s+/i, "");

  const prefix = p.kind === "spbu" ? "SPBU Pertamina" : p.kind === "pertashop" ? "Pertashop" : p.kind === "terminal" ? "" : "Pertamini";
  return joinUnique([prefix, p.code, baseName, street, locality, region, "Bali"]);
}

/**
 * Rute Google Maps dengan tujuan berupa nama tempat yang sudah disusun per SPBU, dibiaskan ke
 * lokasi SPBU (@lat,lng). Google mencocokkan ke tempat SPBU yang sebenarnya, bukan ke titik koordinat
 * yang bisa meleset beberapa meter. Titik awal dikosongkan, jadi memakai lokasi pengguna.
 */
export function googleMapsDirToPlaceUrl(p: Place): string {
  const q = encodeURIComponent(stationSearchQuery(p));
  return `https://www.google.com/maps/dir//${q}/@${p.lat},${p.lng},17z`;
}

/** Rute ke titik koordinat persis, cadangan bila pencarian nama salah. */
export const googleMapsDirToCoordsUrl = googleMapsDirUrl;
