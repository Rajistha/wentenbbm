"use client";
import type { PlacesPayload, StationStatusTuple } from "@wenten/core";
import { useEffect } from "react";
import { IS_DEMO, SNAPSHOT_FALLBACK_URL } from "./env";
import { idbGet, idbSet } from "./idb";
import { flushOfflineReports } from "./offline-queue";
import { useApp } from "./store";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase/client";
import type { StatusResponse } from "./types";

const POLL_MS = IS_DEMO ? 15_000 : 60_000;
const BUFFER_MS = 500;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json() as Promise<T>;
}

let lastPlaces: PlacesPayload | null = null;
let lastStatus: StatusResponse | null = null;

async function loadPlaces() {
  try {
    const p = await getJson<PlacesPayload>("/api/places");
    useApp.getState().applyPlaces(p);
    lastPlaces = p;
    return p;
  } catch {
    if (!SNAPSHOT_FALLBACK_URL) return null;
    const p = await getJson<PlacesPayload>(`${SNAPSHOT_FALLBACK_URL}/places.json`).catch(() => null);
    if (p) useApp.getState().applyPlaces(p);
    return p;
  }
}

export async function refreshStatus(via: "polling" | "fallback" = "polling") {
  try {
    const s = await getJson<StatusResponse>("/api/status", IS_DEMO ? { cache: "no-store" } : undefined);
    useApp.getState().applyStatus(s, via);
    lastStatus = s;
    return s;
  } catch {
    // ARCHITECTURE.md 3.2 langkah 5: cadangan dari Storage
    if (SNAPSHOT_FALLBACK_URL) {
      const s = await getJson<StatusResponse>(`${SNAPSHOT_FALLBACK_URL}/status.json`).catch(() => null);
      if (s) {
        useApp.getState().applyStatus(s, "fallback");
        return s;
      }
    }
    useApp.getState().setLoadError(true);
    return null;
  }
}

/** Ambil snapshot, berlangganan realtime, fallback polling, simpan untuk offline. */
export function useDataSync() {
  useEffect(() => {
    let disposed = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let subscribing = false;
    let buffer: StationStatusTuple[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const persist = (places: PlacesPayload | null, status: StatusResponse | null) => {
      if (places && status) void idbSet("snapshot", { places, status });
    };

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => void refreshStatus(), POLL_MS);
      if (useApp.getState().liveVia !== "fallback") useApp.getState().setLiveVia("polling");
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };

    const subscribe = async () => {
      if (IS_DEMO || channel || subscribing) return;
      subscribing = true;
      const supabase = await getSupabase();
      subscribing = false;
      if (disposed || channel || document.hidden) return;
      channel = supabase
        .channel("status:bali")
        .on("broadcast", { event: "status" }, (msg) => {
          buffer.push(msg.payload as StationStatusTuple);
          flushTimer ??= setTimeout(() => {
            useApp.getState().applyStationUpdates(buffer);
            buffer = [];
            flushTimer = null;
          }, BUFFER_MS);
        })
        .subscribe((state) => {
          if (state === "SUBSCRIBED") {
            stopPolling();
            useApp.getState().setLiveVia("realtime");
          } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
            startPolling();
          }
        });
    };
    const unsubscribe = () => {
      if (!channel) return;
      const ch = channel;
      channel = null;
      void getSupabase().then((s) => s.removeChannel(ch));
    };

    (async () => {
      const cached = await idbGet<{ places: PlacesPayload; status: StatusResponse }>("snapshot");
      if (cached && !disposed && !useApp.getState().places.length) {
        useApp.getState().applyPlaces(cached.places);
        useApp.getState().applyStatus(cached.status, "cache");
      }
      const [places, status] = await Promise.all([loadPlaces(), refreshStatus()]);
      if (disposed) return;
      persist(places, status);
      if (IS_DEMO) startPolling();
      else subscribe();
    })();

    const onVisibility = () => {
      if (document.hidden) {
        // tab di latar belakang: hentikan realtime dan polling (hemat baterai, data, dan kuota)
        unsubscribe();
        stopPolling();
      } else {
        void refreshStatus();
        if (IS_DEMO) startPolling();
        else subscribe();
      }
    };
    const onOnline = () => {
      void refreshStatus();
      void flushOfflineReports();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    void flushOfflineReports();

    // simpan snapshot terbaru untuk mode offline, memakai data yang sudah ada (tanpa fetch ulang)
    const saveTimer = setInterval(() => {
      if (lastPlaces && lastStatus) void idbSet("snapshot", { places: lastPlaces, status: lastStatus });
    }, 5 * 60_000);

    return () => {
      disposed = true;
      stopPolling();
      unsubscribe();
      clearInterval(saveTimer);
      if (flushTimer) clearTimeout(flushTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}
