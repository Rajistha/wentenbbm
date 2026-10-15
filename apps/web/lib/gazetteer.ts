"use client";
import type { GazetteerEntry } from "@wenten/core";
import { lsGet, lsSet } from "./idb";

let cache: Promise<GazetteerEntry[]> | null = null;

/** Muat daftar nama wilayah/desa sekali, dipakai untuk saran "tempat" di pencarian. */
export function loadGazetteer(): Promise<GazetteerEntry[]> {
  cache ??= fetch("/api/gazetteer")
    .then((r) => (r.ok ? r.json() : []))
    .then((rows: [string, GazetteerEntry["type"], number, number][]) =>
      rows.map(([name, type, lat, lng]) => ({ name, type, lat, lng })),
    )
    .catch(() => {
      cache = null;
      return [];
    });
  return cache;
}

export type RecentItem =
  | { kind: "query"; label: string }
  | { kind: "station"; label: string; id: string }
  | { kind: "place"; label: string; lat: number; lng: number; zoom: number };

const KEY = "wenten-recent-search";
const MAX = 8;

export const getRecent = () => lsGet<RecentItem[]>(KEY, []);

export function saveRecent(item: RecentItem) {
  const same = (a: RecentItem, b: RecentItem) => a.kind === b.kind && a.label === b.label;
  lsSet(KEY, [item, ...getRecent().filter((x) => !same(x, item))].slice(0, MAX));
}

export function removeRecent(item: RecentItem) {
  lsSet(KEY, getRecent().filter((x) => !(x.kind === item.kind && x.label === item.label)));
}

export const clearRecent = () => lsSet(KEY, []);
