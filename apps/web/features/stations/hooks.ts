"use client";
import { distanceM, effectiveStatus, type Place } from "@wenten/core";
import { GEOFENCE_M, MAX_ACCURACY_M } from "@/lib/env";
import { useApp } from "@/lib/store";

/** Status kelayakan lapor/validasi di klien (server tetap memeriksa ulang dengan PostGIS). */
export function useGeofence(place: Place | null) {
  const user = useApp((s) => s.user);
  const geofenceOn = useApp((s) => s.geofenceOn);
  // Syarat radius dimatikan admin: boleh melapor dari mana saja. Tanpa lokasi, dipakai titik SPBU itu sendiri.
  if (!geofenceOn && place) {
    const pos = user ?? { lat: place.lat, lng: place.lng, accuracy: 25, at: Date.now() };
    return { ok: true as const, reason: null, distance: user ? distanceM(user, place) : (null as number | null), user: pos };
  }
  if (!place || !user) return { ok: false, reason: "no_location" as const, distance: null as number | null, user };
  const distance = distanceM(user, place);
  if (user.accuracy > MAX_ACCURACY_M) return { ok: false, reason: "low_accuracy" as const, distance, user };
  if (distance > GEOFENCE_M) return { ok: false, reason: "out_of_range" as const, distance, user };
  return { ok: true, reason: null, distance, user };
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
