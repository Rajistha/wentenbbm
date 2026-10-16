"use client";
import type { FuelStatus } from "@wenten/core";
import { useEffect } from "react";
import { create } from "zustand";
import { lsGet, lsSet } from "./idb";
import { useApp } from "./store";

const KEY = "wenten-favorites";
const SEEN_KEY = "wenten-favorites-seen";
const MAX = 12;

interface FavState {
  ids: string[];
  /** Status terakhir yang dilihat pengguna per favorit, untuk kabar "sejak terakhir kamu lihat". */
  seen: Record<string, FuelStatus>;
  restore(): void;
  toggle(id: string): boolean;
  setSeen(next: Record<string, FuelStatus>): void;
}

export const useFavorites = create<FavState>((set, get) => ({
  ids: [],
  seen: {},
  restore() {
    set({ ids: lsGet<string[]>(KEY, []), seen: lsGet<Record<string, FuelStatus>>(SEEN_KEY, {}) });
  },
  /** Mengembalikan false bila batas favorit tercapai. */
  toggle(id) {
    const { ids, seen } = get();
    if (ids.includes(id)) {
      const next = ids.filter((x) => x !== id);
      set({ ids: next });
      lsSet(KEY, next);
      return true;
    }
    if (ids.length >= MAX) return false;
    const next = [...ids, id];
    const cur = useApp.getState().statuses.get(id)?.overall ?? "unknown";
    const nextSeen = { ...seen, [id]: cur };
    set({ ids: next, seen: nextSeen });
    lsSet(KEY, next);
    lsSet(SEEN_KEY, nextSeen);
    return true;
  },
  setSeen(next) {
    set({ seen: next });
    lsSet(SEEN_KEY, next);
  },
}));

export const FAVORITES_MAX = MAX;

/**
 * Kabar perubahan SPBU favorit. Saat data baru masuk, bandingkan dengan status terakhir yang dilihat pengguna;
 * bila berubah jadi Tersedia atau Habis, tampilkan pemberitahuan di dalam aplikasi. Tidak ada notifikasi saat
 * aplikasi tertutup (itu butuh server push).
 */
export function useFavoriteAlerts(format: (name: string, status: FuelStatus) => string) {
  useEffect(() => {
    useFavorites.getState().restore();
    const check = () => {
      const { ids, seen, setSeen } = useFavorites.getState();
      const app = useApp.getState();
      if (!ids.length || !app.places.length || app.statuses.size === 0) return;
      const next = { ...seen };
      const msgs: string[] = [];
      for (const id of ids) {
        const place = app.placeById.get(id);
        if (!place) continue;
        const cur = app.statuses.get(id)?.overall ?? "unknown";
        const prev = seen[id];
        if (prev && prev !== cur && (cur === "available" || cur === "empty")) msgs.push(format(place.name, cur));
        next[id] = cur;
      }
      if (JSON.stringify(next) !== JSON.stringify(seen)) setSeen(next);
      if (msgs.length) app.showToast(msgs.length === 1 ? msgs[0]! : `${msgs[0]} (+${msgs.length - 1})`);
    };
    const unsub = useApp.subscribe((s, p) => {
      if (s.statuses !== p.statuses || s.places !== p.places) check();
    });
    check();
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
