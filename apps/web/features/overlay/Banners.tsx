"use client";
import { Icon } from "@/features/common/Icon";
import { formatWita, type Locale } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { lsGet, lsSet } from "@/lib/idb";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "@/lib/store";
import { refreshStatus } from "@/lib/sync";

const DISMISSED_KEY = "wenten-dismissed-ann";

/** Pengumuman admin yang bisa ditutup, tersimpan per perangkat (US-08). */
export function AnnouncementBanner() {
  const t = useTranslations("banners");
  const announcements = useApp((s) => s.announcements);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => setDismissed(lsGet<string[]>(DISMISSED_KEY, [])), []);
  const current = announcements.find((a) => !dismissed.includes(a.id));
  if (!current) return null;
  return (
    <div className={`float-card banner${current.level === "important" ? " banner-important" : ""}`} role="region" aria-label={current.title}>
      <Icon name="announce" />
      <div className="grow">
        <strong>{current.title}</strong>
        <div className="caption muted">{current.body}</div>
      </div>
      <button
        type="button"
        className="btn btn-icon btn-ghost"
        style={{ minHeight: 36, width: 36 }}
        aria-label={t("dismiss")}
        onClick={() => {
          const next = [...dismissed, current.id];
          setDismissed(next);
          lsSet(DISMISSED_KEY, next);
        }}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

/** Banner sistem: offline, mode baca-saja, gagal memuat (DESIGN.md 8). */
export function SystemBanners() {
  const t = useTranslations("banners");
  const locale = useLocale() as Locale;
  const { readOnly, loadError, generatedAt, liveVia } = useApp(
    useShallow((s) => ({ readOnly: s.readOnly, loadError: s.loadError, generatedAt: s.generatedAt, liveVia: s.liveVia })),
  );
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const time = generatedAt ? formatWita(generatedAt, locale) : "-";
  return (
    <>
      {offline && (
        <div className="float-card banner banner-system" role="status">
          <div className="grow">{t("offline", { time })}</div>
        </div>
      )}
      {!offline && readOnly && (
        <div className="float-card banner banner-system" role="status">
          <div className="grow">{t("readOnly")}</div>
        </div>
      )}
      {!offline && loadError && (
        <div className="float-card banner banner-system" role="alert">
          <div className="grow">{t("loadError")}</div>
          <button type="button" className="btn" style={{ minHeight: 36 }} onClick={() => void refreshStatus()} aria-label={t("retry")}>
            <Icon name="refresh" />
          </button>
        </div>
      )}
      {!offline && liveVia === "cache" && !loadError && (
        <div className="float-card banner banner-system" role="status">
          <div className="grow">{t("offline", { time })}</div>
        </div>
      )}
    </>
  );
}

export function Toast() {
  const toast = useApp((s) => s.toast);
  const hide = useApp((s) => s.hideToast);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(hide, 4200);
    return () => clearTimeout(id);
  }, [toast, hide]);
  if (!toast) return null;
  return (
    <div key={toast.id} className="toast" role="status" aria-live="polite">
      {toast.text}
    </div>
  );
}
