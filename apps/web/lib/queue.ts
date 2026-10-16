"use client";
import type { QueueEndReason } from "@wenten/db/rpc";
import type { Place, RpcErrorCode } from "@wenten/core";
import { create } from "zustand";
import { callRpc, RpcError } from "./backend/client";
import { IS_DEMO } from "./env";
import { lsGet, lsSet } from "./idb";
import { refreshStatus } from "./sync";
import { useApp } from "./store";

export interface QueueSession {
  id: string;
  stationId: string;
  fuelTypeId: number | null;
  startedAt: number;
}

const KEY = "wenten-queue";

interface QueueState {
  session: QueueSession | null;
  busy: boolean;
  /** Pulihkan sesi yang tersimpan (halaman dimuat ulang) dan cocokkan dengan server. */
  restore(): void;
  join(place: Place, fuelTypeId: number | null): Promise<{ ok: true } | { ok: false; code: RpcErrorCode; distance_m?: number }>;
  leave(reason: QueueEndReason): Promise<{ ok: true; waitMinutes: number } | { ok: false; code: RpcErrorCode }>;
  /** Server menutup sesi (menjauh dari SPBU atau lama tanpa denyut). */
  drop(): void;
}

function persist(s: QueueSession | null) {
  lsSet(KEY, s);
}

export const useQueue = create<QueueState>((set, get) => ({
  session: null,
  busy: false,

  restore() {
    if (IS_DEMO) return;
    const saved = lsGet<QueueSession | null>(KEY, null);
    if (!saved) return;
    set({ session: saved });
    callRpc("queue_my_session", {})
      .then((s) => {
        if (!s) {
          set({ session: null });
          persist(null);
        }
      })
      .catch(() => {});
  },

  async join(place, fuelTypeId) {
    const user = useApp.getState().user;
    if (!user) return { ok: false, code: "LOW_ACCURACY" };
    set({ busy: true });
    try {
      const res = await callRpc("queue_join", {
        p_station_id: place.id,
        p_fuel_type_id: fuelTypeId,
        p_lat: user.lat,
        p_lng: user.lng,
        p_accuracy_m: Math.round(user.accuracy),
      });
      if (!res.ok) return { ok: false, code: res.code, distance_m: res.distance_m };
      const s: QueueSession = { id: res.session_id, stationId: place.id, fuelTypeId, startedAt: new Date(res.started_at).getTime() };
      set({ session: s });
      persist(s);
      void refreshStatus();
      return { ok: true };
    } catch (err) {
      return { ok: false, code: err instanceof RpcError ? err.code : "NETWORK" };
    } finally {
      set({ busy: false });
    }
  },

  async leave(reason) {
    const s = get().session;
    if (!s) return { ok: false, code: "NOT_FOUND" };
    const user = useApp.getState().user;
    set({ busy: true });
    try {
      const res = await callRpc("queue_leave", {
        p_session_id: s.id,
        p_reason: reason,
        p_lat: user?.lat ?? null,
        p_lng: user?.lng ?? null,
        p_accuracy_m: user ? Math.round(user.accuracy) : null,
      });
      // Sesi tidak ditemukan di server berarti sudah berakhir: bersihkan lokal juga
      if (!res.ok && res.code !== "NOT_FOUND") return { ok: false, code: res.code };
      set({ session: null });
      persist(null);
      void refreshStatus();
      return { ok: true, waitMinutes: res.ok ? res.wait_minutes : Math.round((Date.now() - s.startedAt) / 60_000) };
    } catch (err) {
      return { ok: false, code: err instanceof RpcError ? err.code : "NETWORK" };
    } finally {
      set({ busy: false });
    }
  },

  drop() {
    set({ session: null });
    persist(null);
    void refreshStatus();
  },
}));
