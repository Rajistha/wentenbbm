import type { Locale } from "./types";

export const WITA_TZ = "Asia/Makassar";

/** DESIGN.md 9: < 1 km dibulatkan ke 50 m, di atas 1 km satu desimal. */
export function formatDistance(m: number, locale: Locale = "id"): string {
  if (m < 1000) {
    const r = Math.max(50, Math.round(m / 50) * 50);
    return r >= 1000 ? formatKm(1000, locale) : `${r} m`;
  }
  return formatKm(m, locale);
}

function formatKm(m: number, locale: Locale) {
  const km = m / 1000;
  return `${km.toLocaleString(locale === "id" ? "id-ID" : "en-GB", {
    minimumFractionDigits: km < 100 ? 1 : 0,
    maximumFractionDigits: km < 100 ? 1 : 0,
  })} km`;
}

/** "19.02 WITA" (format 24 jam). */
export function formatWita(iso: string | Date, locale: Locale = "id", withDate = false): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const time = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    timeZone: WITA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(withDate ? { day: "numeric", month: "short" } : {}),
  }).format(d);
  return `${time.replace(":", ".")} WITA`;
}

export function ageMinutes(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, (now - new Date(iso).getTime()) / 60000);
}

/** "12 mnt lalu" / "12 min ago". */
export function formatRelative(iso: string, locale: Locale = "id", now = Date.now()): string {
  const min = Math.floor(ageMinutes(iso, now) ?? 0);
  if (locale === "id") {
    if (min < 1) return "baru saja";
    if (min < 60) return `${min} mnt lalu`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} jam lalu`;
    return `${Math.floor(h / 24)} hari lalu`;
  }
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function formatNumber(n: number, locale: Locale = "id"): string {
  return n.toLocaleString(locale === "id" ? "id-ID" : "en-GB");
}

export type Freshness = "new" | "normal" | "stale" | "expired";

/** PRD 8 "Kesegaran". */
export function freshness(ageMin: number | null): Freshness {
  if (ageMin == null || ageMin > 120) return "expired";
  if (ageMin <= 30) return "new";
  if (ageMin <= 90) return "normal";
  return "stale";
}
