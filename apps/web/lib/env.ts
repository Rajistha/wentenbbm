export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Tanpa Supabase, aplikasi berjalan dalam mode demo dengan backend tiruan di memori server. */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "";

export const SNAPSHOT_FALLBACK_URL =
  process.env.NEXT_PUBLIC_SNAPSHOT_FALLBACK_URL ||
  (SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/snapshots` : "");

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Parameter yang juga dipakai klien untuk pengecekan awal (server tetap sumber kebenaran). */
export const GEOFENCE_M = 300;
export const MAX_ACCURACY_M = 100;
