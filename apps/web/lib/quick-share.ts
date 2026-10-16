"use client";
import { SITE_URL } from "./env";

/**
 * Bagikan satu ketukan: gambar ringkasan disiapkan lebih dulu (prefetch) lalu menu bagikan perangkat dibuka
 * seketika. Browser (terutama Safari iOS) hanya mengizinkan menu bagikan tepat setelah ketukan pengguna, jadi
 * gambar harus sudah ada di memori saat tombol ditekan; mengunduhnya setelah ketukan sering ditolak.
 */

const TTL_MS = 5 * 60_000;
const FORMAT = "story";

interface Cached {
  blob: Blob;
  at: number;
  lang: string;
}
let cache: Cached | null = null;
let inflight: Promise<Blob | null> | null = null;

const bucket = () => Math.floor(Date.now() / TTL_MS);
export const imageUrl = (lang: string, format: string = FORMAT) => `/api/share/image?f=${format}&lang=${lang}&t=${bucket()}`;

/** Perangkat bisa membagikan berkas gambar lewat menu bagikan bawaan. */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array(1)], "x.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/** Unduh gambar ke memori. Satu permintaan pada satu waktu; hasil dipakai ulang selama 5 menit. */
export function prefetchShareImage(lang: string): Promise<Blob | null> {
  if (cache && cache.lang === lang && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.blob);
  inflight ??= fetch(imageUrl(lang))
    .then((r) => (r.ok ? r.blob() : null))
    .then((blob) => {
      if (blob) cache = { blob, at: Date.now(), lang };
      return blob;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Gambar yang sudah siap (sinkron), walau sedikit kedaluwarsa: lebih baik gambar 10 menit lalu daripada gagal membuka menu. */
export function readyImage(lang: string): Blob | null {
  return cache && cache.lang === lang ? cache.blob : null;
}

export const siteUrl = (lang: string) => SITE_URL.replace(/\/$/, "") + (lang === "en" ? "/en" : "");

type Outcome = "shared" | "cancelled" | "unsupported" | "failed";

/** Panggil langsung di dalam penangan klik. `text` sudah memuat tautan situs. */
export function shareNow(lang: string, text: string): Outcome | Promise<Outcome> {
  if (!canShareFiles()) return "unsupported";
  const blob = readyImage(lang);
  if (!blob) return "failed";
  const file = new File([blob], "wenten-bbm.png", { type: "image/png" });
  if (!navigator.canShare({ files: [file] })) return "unsupported";
  // Segarkan di latar belakang bila sudah lama, untuk ketukan berikutnya
  if (!cache || Date.now() - cache.at >= TTL_MS) void prefetchShareImage(lang);
  return navigator
    .share({ files: [file], text })
    .then((): Outcome => "shared")
    .catch((err: unknown): Outcome => (err instanceof DOMException && err.name === "AbortError" ? "cancelled" : "failed"));
}
