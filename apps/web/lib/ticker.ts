"use client";
import { useSyncExternalStore } from "react";

// Satu setInterval untuk semua komponen waktu relatif (sebelumnya satu per kartu).
let now = Date.now();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      subs.forEach((f) => f());
    }, 30_000);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useTicker(): number {
  return useSyncExternalStore(subscribe, () => now, () => now);
}
