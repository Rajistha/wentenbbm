import type { Place } from "./types";

/**
 * Jam buka harian yang tercatat di OpenStreetMap ("HH:MM-HH:MM", setiap hari). Hanya SPBU yang jamnya
 * memang tercatat; selebihnya tidak ditebak. "24 jam" dibaca dari Place.is24h. Jam 00:00 sebagai
 * penutup berarti tengah malam.
 */
export const OPENING_HOURS: Record<string, string> = {
  "spbu-mekarsari": "06:00-22:00",
  "spbu-kerobokan-kelod": "05:00-00:00",
  "spbu-peliatan": "05:00-22:00",
  "spbu-panjer-2": "05:00-00:00",
  "spbu-sumerta-kelod-4": "06:00-21:00",
  "spbu-antiga": "09:00-21:00",
  "spbu-mekar-bhuwana": "08:00-20:00",
  "spbu-perumahan-jepun-kuning": "06:00-23:00",
  "spbu-pelumas": "05:00-21:30",
  "spbu-tegallalang-4": "06:00-20:00",
  "spbu-padangsambian-kelod": "05:00-00:00",
  "pertashop-telagatawang": "06:00-20:30",
};

export type OpeningState =
  | { kind: "h24" }
  | { kind: "open"; closesAt: string }
  | { kind: "closed"; opensAt: string };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};
const label = (hhmm: string) => hhmm.replace(":", ".");

/** Jam buka terkini menurut waktu WITA. null bila jam buka tidak tercatat. */
export function openingState(place: Pick<Place, "slug" | "is24h">, now: number = Date.now()): OpeningState | null {
  if (place.is24h) return { kind: "h24" };
  const hours = OPENING_HOURS[place.slug];
  if (!hours) return null;
  const [open, close] = hours.split("-") as [string, string];
  const wita = new Date(now + 8 * 3600_000);
  const cur = wita.getUTCHours() * 60 + wita.getUTCMinutes();
  const o = toMin(open);
  const c = toMin(close) === 0 ? 24 * 60 : toMin(close);
  return cur >= o && cur < c ? { kind: "open", closesAt: label(close) } : { kind: "closed", opensAt: label(open) };
}
