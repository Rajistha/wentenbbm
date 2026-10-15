"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runTurnstile } from "./turnstile";

/**
 * Sesi anonim dibuat secara malas, hanya saat pengguna pertama kali melapor atau memberi suara
 * (ARCHITECTURE.md 4.1). Pengunjung yang hanya melihat peta tidak pernah menyentuh Auth.
 */
export async function ensureSession(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const captchaToken = await runTurnstile();
  const { data: signIn, error } = await supabase.auth.signInAnonymously(
    captchaToken ? { options: { captchaToken } } : undefined,
  );
  if (error) throw error;
  return signIn.session;
}

/** ID perangkat untuk mode demo (pengganti JWT anonim). */
export function demoDeviceId(): string {
  try {
    let id = localStorage.getItem("wenten-demo-device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("wenten-demo-device", id);
    }
    return id;
  } catch {
    return "anon";
  }
}
