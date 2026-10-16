"use client";
import { distanceM, effectiveStatus, type Place } from "@wenten/core";
import { radiusLabel } from "@/lib/geofence";
import { useApp } from "@/lib/store";

/** Status kelayakan lapor/validasi di klien (server tetap memeriksa ulang dengan PostGIS). */
export function useGeofence(place: Place | null) {
  const user = useApp((s) => s.user);
  const geofenceOn = useApp((s) => s.geofenceOn);
  const geofenceM = useApp((s) => s.geofenceM);
  const maxAccuracyM = useApp((s) => s.maxAccuracyM);
  // Lokasi pengguna SELALU wajib (dipakai admin untuk menilai asal laporan), juga saat syarat radius dimatikan.
  if (!place || !user) return { ok: false, reason: "no_location" as const, distance: null as number | null, user };
  const distance = distanceM(user, place);
  // Syarat radius mati: tidak ada batas jarak dan akurasi, tetapi lokasi tetap dikirim apa adanya
  if (!geofenceOn) return { ok: true, reason: null, distance, user };
  if (user.accuracy > maxAccuracyM) return { ok: false, reason: "low_accuracy" as const, distance, user };
  if (distance > geofenceM) return { ok: false, reason: "out_of_range" as const, distance, user };
  return { ok: true, reason: null, distance, user };
}

type GeoReason = "no_location" | "low_accuracy" | "out_of_range" | null;

/** Pesan untuk pengguna yang belum boleh melapor/memvalidasi: izin lokasi, akurasi, atau di luar radius. */
export function geoHint(t: (key: string, values?: Record<string, string | number>) => string, reason: GeoReason, kind: "report" | "vote" = "report") {
  if (reason === "low_accuracy") return t("location.lowAccuracy");
  if (reason === "no_location" && !useApp.getState().geofenceOn) return t("detail.needLocation");
  return t(kind === "vote" ? "detail.voteNeedNear" : "detail.reportNeedNear", { m: radiusLabel() });
}

export function useStationStatus(id: string | null) {
  const status = useApp((s) => (id ? s.statuses.get(id) : undefined));
  const fuelFilter = useApp((s) => s.fuelFilter);
  return { status, effective: effectiveStatus(status, fuelFilter) };
}

export function useFuelName() {
  const fuelTypes = useApp((s) => s.fuelTypes);
  return (id: number) => fuelTypes.find((f) => f.id === id)?.name ?? `#${id}`;
}

/** Buka modal bagikan (QR, salin tautan, aplikasi). */
export function useShare() {
  const openShare = useApp((s) => s.openShare);
  return (url: string, text: string, title = "Wenten BBM", slug?: string) => openShare({ url, text, title, slug });
}
