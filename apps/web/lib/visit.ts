"use client";
import { useEffect } from "react";
import { callRpc } from "./backend/client";
import { deviceId } from "./device";
import { IS_DEMO } from "./env";
import { lsGet, lsSet } from "./idb";

const KEY = `wenten-visit-day:${IS_DEMO ? "demo" : "db"}`;

/** Catat kunjungan sekali per hari (WITA) per perangkat. Ditunda agar tidak bersaing dengan muat awal. */
export function useRegisterVisit() {
  useEffect(() => {
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" });
    if (lsGet<string>(KEY, "") === day) return;
    const id = setTimeout(() => {
      callRpc("register_visit", { p_device: deviceId() })
        // Database lama (migrasi 0008 belum dijalankan) tidak punya parameter ini: coba cara lama
        .catch(() => callRpc("register_visit", {}))
        .then(() => lsSet(KEY, day))
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(id);
  }, []);
}
