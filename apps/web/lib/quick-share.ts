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

export interface QuickShareHooks {
  /** Gambar belum siap: sedang diunduh. */
  preparing(): void;
  /** Hasil akhir: menu bagikan dipakai, gambar diunduh dan teks disalin, atau gagal. */
  done(kind: "shared" | "downloaded" | "failed"): void;
}

function download(blob: Blob, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "wenten-bbm.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  void navigator.clipboard?.writeText(text).catch(() => {});
}

/**
 * Panggil langsung di dalam penangan klik. Bila gambar sudah siap, menu bagikan perangkat dibuka seketika
 * (masih dalam ketukan pengguna). Bila perangkat tidak mendukung berbagi berkas, gambar diunduh dan teks
 * (beserta tautan) disalin. `text` sudah memuat tautan situs.
 */
export function quickShare(lang: string, text: string, hooks: QuickShareHooks) {
  const run = async (blob: Blob) => {
    const file = new File([blob], "wenten-bbm.png", { type: "image/png" });
    if (canShareFiles() && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        hooks.done("shared");
        return;
      } catch (err) {
        // Pengguna menutup menu bagikan: selesai. Galat lain (mis. izin ketukan hilang): unduh saja.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    download(blob, text);
    hooks.done("downloaded");
  };
  const ready = readyImage(lang);
  if (ready) {
    void run(ready);
    // Segarkan di latar belakang bila sudah lama, untuk ketukan berikutnya
    if (!cache || Date.now() - cache.at >= TTL_MS) void prefetchShareImage(lang);
    return;
  }
  hooks.preparing();
  void prefetchShareImage(lang).then((b) => (b ? run(b) : hooks.done("failed")));
}
