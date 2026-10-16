"use client";
import { summarizeFuel } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { prefetchShareImage, shareNow, siteUrl } from "@/lib/quick-share";
import { useApp } from "@/lib/store";

/**
 * Tombol Bagikan umum: satu ketukan langsung membuka menu bagikan perangkat (Instagram, WhatsApp, aplikasi
 * lain) dengan gambar ringkasan terlampir. Bila perangkat tidak mendukung berbagi berkas, atau gambar
 * belum siap, modal pilihan format dibuka sebagai cadangan.
 */
export function useQuickShare() {
  const t = useTranslations("snap");
  const tShare = useTranslations("share");
  const lang = useLocale();

  const openModal = () => useApp.getState().openShare({ url: "/", title: "Wenten BBM", text: tShare("text") });

  return () => {
    const { places, statuses } = useApp.getState();
    const s = summarizeFuel(places, statuses, 0);
    const msg = s.reported === 0 ? t("msgNoData") : t("msgText", { n: s.withFuel, total: s.total });
    const text = `${msg} ${siteUrl(lang)}`;

    const out = shareNow(lang, text);
    if (typeof out !== "string") {
      void out.then((r) => {
        if (r === "failed") openModal();
      });
      return;
    }
    if (out === "failed") {
      // Gambar belum sempat disiapkan: mulai unduh dan buka modal yang punya pratinjau dan tombol sendiri
      void prefetchShareImage(lang);
    }
    openModal();
  };
}
