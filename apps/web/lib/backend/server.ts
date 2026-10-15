import "server-only";
import { createClient } from "@supabase/supabase-js";
import { decodePlace, decodeStationStatus, type PlacesPayload, type PlaceTuple, type StationStatusTuple } from "@wenten/core";
import { IS_DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from "../env";
import { staticPlacesPayload } from "../places-static";
import type { DashboardPayload, StatusResponse } from "../types";

// Klien anon tanpa sesi, khusus jalur baca di server (route handler, halaman /data, metadata OG).
function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await anonClient().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function demo() {
  return import("../demo/store");
}

export async function getPlacesPayload(): Promise<PlacesPayload> {
  if (IS_DEMO) return (await demo()).demoPlaces();
  // Database belum diisi atau gagal: tetap tampilkan lokasi bawaan (tanpa status)
  try {
    const p = await rpc<PlacesPayload>("public_places_snapshot");
    if (p?.places?.length) return p;
  } catch (err) {
    console.error(err);
  }
  return staticPlacesPayload();
}

export async function getStatusPayload(): Promise<StatusResponse> {
  if (IS_DEMO) return (await demo()).demoStatus();
  return rpc<StatusResponse>("public_status_snapshot");
}

export async function getDashboard(): Promise<DashboardPayload> {
  if (IS_DEMO) return (await demo()).demoDashboard();
  return rpc<DashboardPayload>("public_dashboard");
}

/** Untuk halaman berbagi /spbu/[slug] dan gambar OG. */
export async function getPlaceBySlug(slug: string) {
  if (IS_DEMO) return (await demo()).demoPlaceBySlug(slug);
  const [places, status] = await Promise.all([getPlacesPayload(), getStatusPayload()]);
  const tuple = places.places.find((p: PlaceTuple) => p[1] === slug);
  if (!tuple) return null;
  const place = decodePlace(tuple);
  const st = status.stations.find((s: StationStatusTuple) => s[0] === place.id);
  return { place, status: st ? decodeStationStatus(st) : null };
}

export async function checkHealth(): Promise<{ ok: boolean; mode: "demo" | "supabase"; latency_ms: number }> {
  const t = Date.now();
  if (IS_DEMO) return { ok: true, mode: "demo", latency_ms: 0 };
  try {
    const { error } = await anonClient().from("regions").select("id").limit(1);
    return { ok: !error, mode: "supabase", latency_ms: Date.now() - t };
  } catch {
    return { ok: false, mode: "supabase", latency_ms: Date.now() - t };
  }
}
