"use client";
import { useEffect } from "react";
import { callRpc } from "./backend/client";
import { IS_DEMO } from "./env";
import { lsGet, lsSet } from "./idb";

const KEY = `wenten-visit-day:${IS_DEMO ? "demo" : "db"}`;

/** Catat kunjungan sekali per hari (WITA) per perangkat. Ditunda agar tidak bersaing dengan muat awal. */
export function useRegisterVisit() {
  useEffect(() => {
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" });
    if (lsGet<string>(KEY, "") === day) return;
    const id = setTimeout(() => {
      callRpc("register_visit", {})
        .then(() => lsSet(KEY, day))
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(id);
  }, []);
}
