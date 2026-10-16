"use client";
import { useEffect } from "react";
import { deviceId } from "./device";
import { IS_DEMO } from "./env";
import { getSupabase } from "./supabase/client";
import { useApp } from "./store";

/**
 * Hitung pengunjung online lewat Supabase Realtime Presence: tiap tab yang terbuka bergabung ke
 * satu kanal; entri hilang otomatis saat tab ditutup. Hanya ID perangkat acak yang dikirim.
 * Tab tersembunyi keluar dari kanal (hemat koneksi) dan bergabung lagi saat dibuka.
 */
export function usePresence() {
  useEffect(() => {
    if (IS_DEMO) return;
    let disposed = false;
    let channel: ReturnType<Awaited<ReturnType<typeof getSupabase>>["channel"]> | null = null;
    let client: Awaited<ReturnType<typeof getSupabase>> | null = null;

    const leave = () => {
      if (channel && client) void client.removeChannel(channel);
      channel = null;
    };
    const join = async () => {
      if (channel || disposed || document.hidden) return;
      client = await getSupabase();
      if (channel || disposed || document.hidden) return;
      // Beberapa tab satu perangkat terhitung sekali: kunci presence = ID perangkat
      const ch = client.channel("online:bali", { config: { presence: { key: deviceId() } } });
      channel = ch;
      ch.on("presence", { event: "sync" }, () => {
        useApp.setState({ presenceCount: Object.keys(ch.presenceState()).length });
      }).subscribe((state) => {
        if (state === "SUBSCRIBED") void ch.track({ t: Date.now() });
      });
    };

    const onVisibility = () => (document.hidden ? leave() : void join());
    document.addEventListener("visibilitychange", onVisibility);
    void join();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      leave();
    };
  }, []);
}
