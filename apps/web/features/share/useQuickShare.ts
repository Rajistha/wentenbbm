"use client";
import { summarizeFuel } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { quickShare, siteUrl } from "@/lib/quick-share";
import { useApp } from "@/lib/store";

/**
 * Tombol Bagikan umum (dock dan menu info, HP dan desktop): satu ketukan langsung membuka menu bagikan
 * perangkat (Instagram, WhatsApp, aplikasi lain) dengan gambar ringkasan terlampir. Di perangkat tanpa
 * menu bagikan berkas, gambar diunduh dan teks beserta tautan disalin.
 */
export function useQuickShare() {
  const t = useTranslations("snap");
  const lang = useLocale();

  return () => {
    const { places, statuses, showToast } = useApp.getState();
    const s = summarizeFuel(places, statuses, 0);
    const msg = s.reported === 0 ? t("msgNoData") : t("msgText", { n: s.withFuel, total: s.total });
    quickShare(lang, `${msg} ${siteUrl(lang)}`, {
      preparing: () => showToast(t("preparing")),
      done: (kind) => {
        if (kind === "downloaded") showToast(t("downloadedCopied"));
        else if (kind === "failed") showToast(t("failed"));
      },
    });
  };
}
