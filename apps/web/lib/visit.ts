"use client";
import { useEffect } from "react";
import { callRpc } from "./backend/client";
import { deviceId } from "./device";
import { IS_DEMO } from "./env";
import { lsGet, lsSet } from "./idb";

const KEY = `wenten-visit-beat:${IS_DEMO ? "demo" : "db"}`;
const BEAT_MS = 15 * 60_000;

/**
 * Catat kunjungan (sekali per hari per perangkat di server) dan kirim denyut tiap 15 menit selama tab
 * terlihat, agar server bisa menghitung perangkat online (denyut dalam 1 jam terakhir). Ditunda agar tidak
 * bersaing dengan muat awal.
 */
export function useRegisterVisit() {
  useEffect(() => {
    const beat = () => {
      if (document.hidden || Date.now() - lsGet<number>(KEY, 0) < BEAT_MS) return;
      lsSet(KEY, Date.now());
      callRpc("register_visit", { p_device: deviceId() })
        // Database lama (migrasi 0008 belum dijalankan) tidak punya parameter ini: coba cara lama
        .catch(() => callRpc("register_visit", {}))
        .catch(() => lsSet(KEY, 0));
    };
    const first = setTimeout(beat, 4000);
    const timer = setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
}
