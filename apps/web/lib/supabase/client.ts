"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";

let client: Promise<SupabaseClient> | null = null;

/** Klien Supabase dimuat malas (±50 KB), jadi tidak membebani muatan awal dan tidak dimuat sama sekali di mode demo. */
export function getSupabase(): Promise<SupabaseClient> {
  client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "wenten-auth" },
      realtime: { params: { eventsPerSecond: 5 } },
    }),
  );
  return client;
}
