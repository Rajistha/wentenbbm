"use client";
import { TURNSTILE_SITE_KEY } from "@/lib/env";

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile_load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Widget Turnstile tak terlihat (ARCHITECTURE.md 4.1). Mengembalikan undefined bila site key belum diisi. */
export async function runTurnstile(): Promise<string | undefined> {
  if (!TURNSTILE_SITE_KEY) return undefined;
  const api = await loadScript();
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.bottom = "0";
  host.style.right = "0";
  host.style.zIndex = "100";
  document.body.appendChild(host);
  try {
    return await new Promise<string>((resolve, reject) => {
      const id = api.render(host, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "invisible",
        callback: (token: string) => {
          resolve(token);
          api.remove(id);
        },
        "error-callback": (code?: unknown) => {
          reject(new Error(`turnstile_failed:${String(code ?? "")}`));
          return true;
        },
        "timeout-callback": () => reject(new Error("turnstile_timeout")),
      });
    });
  } finally {
    host.remove();
  }
}
