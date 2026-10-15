"use client";
import { useSyncExternalStore } from "react";

function subscribe(query: string) {
  return (cb: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener("change", cb);
    return () => m.removeEventListener("change", cb);
  };
}

export function useMedia(query: string, serverValue = false) {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useIsDesktop = () => useMedia("(min-width: 1024px)");
export const useReducedMotion = () => useMedia("(prefers-reduced-motion: reduce)");
