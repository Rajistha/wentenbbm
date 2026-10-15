"use client";
import { effectiveStatus, sellsFuel, type Place } from "@wenten/core";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "@/lib/store";

/** SPBU yang tampil di peta dan daftar setelah filter jenis BBM, status, dan lapisan. */
export function useVisiblePlaces(): Place[] {
  const { places, statuses, fuelFilter, onlyAvailable, statusFilter, showRetail, onlyConfirmed } = useApp(
    useShallow((s) => ({
      places: s.places,
      statuses: s.statuses,
      fuelFilter: s.fuelFilter,
      onlyAvailable: s.onlyAvailable,
      statusFilter: s.statusFilter,
      showRetail: s.showRetail,
      onlyConfirmed: s.onlyConfirmed,
    })),
  );
  return useMemo(
    () =>
      places.filter((p) => {
        if (p.kind === "terminal") return false;
        if (p.kind !== "spbu" && !showRetail) return false;
        if (!sellsFuel(p, fuelFilter)) return false;
        const e = effectiveStatus(statuses.get(p.id), fuelFilter);
        if (onlyAvailable && e.status !== "available" && e.status !== "limited") return false;
        if (statusFilter && e.status !== statusFilter) return false;
        if (onlyConfirmed && !e.confirmed) return false;
        return true;
      }),
    [places, statuses, fuelFilter, onlyAvailable, statusFilter, showRetail, onlyConfirmed],
  );
}

export function useSelectedPlace() {
  return useApp((s) => (s.selectedId ? s.placeById.get(s.selectedId) ?? null : null));
}
