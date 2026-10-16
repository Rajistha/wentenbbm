"use client";
import { formatRadius } from "@wenten/core";
import { useApp } from "./store";

/** Radius lapor saat ini ("300 m") untuk disisipkan ke teks; mengikuti pengaturan admin dan bahasa halaman. */
export function radiusLabel(): string {
  const lang = typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "id";
  return formatRadius(useApp.getState().geofenceM, lang);
}
