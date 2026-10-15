"use client";
import { distanceM } from "@wenten/core";
import { useEffect } from "react";
import { useApp } from "./store";

let watchId: number | null = null;

/** Mulai memantau lokasi (akurasi tinggi, dibutuhkan untuk geofence laporan). */
export function startLocation() {
  if (!("geolocation" in navigator)) {
    useApp.getState().setGeoState("unavailable");
    return;
  }
  if (watchId != null) return;
  const { setGeoState, setUser } = useApp.getState();
  setGeoState("requesting");
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const cur = useApp.getState().user;
      if (cur?.simulated) return;
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp };
      // Abaikan pembaruan kecil: tanpa ini daftar diurutkan ulang dan peta digambar ulang tiap detik
      if (cur && distanceM(cur, next) < 15 && Math.abs(cur.accuracy - next.accuracy) < 15 && next.at - cur.at < 20_000) return;
      setGeoState("granted");
      setUser(next);
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        setGeoState("denied");
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        watchId = null;
        useApp.getState().setPendingNearest(false);
      } else if (!useApp.getState().user) {
        setGeoState("unavailable");
      }
    },
    { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
  );
}

/** Mode demo: anggap pengguna berada di titik tertentu (akurasi 15 m). */
export function simulateLocation(lat: number, lng: number) {
  useApp.getState().setGeoState("granted");
  useApp.getState().setUser({ lat, lng, accuracy: 15, at: Date.now(), simulated: true });
}

/** Saat pertama dibuka: jika izin sudah diberikan langsung mulai, jika belum tampilkan penjelasan (US-01). */
export function useGeolocationBootstrap() {
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      useApp.getState().setGeoState("unavailable");
      return;
    }
    const perms = navigator.permissions;
    if (!perms?.query) {
      useApp.getState().setGeoState("prompt");
      return;
    }
    perms
      .query({ name: "geolocation" })
      .then((p) => {
        if (p.state === "granted") startLocation();
        else useApp.getState().setGeoState(p.state === "denied" ? "denied" : "prompt");
      })
      .catch(() => useApp.getState().setGeoState("prompt"));
  }, []);
}
