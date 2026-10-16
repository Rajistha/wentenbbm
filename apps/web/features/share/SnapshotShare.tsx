"use client";
import { summarizeFuel, type Locale } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { SITE_URL } from "@/lib/env";
import { useApp } from "@/lib/store";
import { Icon } from "../common/Icon";

type Format = "story" | "post" | "message";
const FORMATS: Format[] = ["story", "post", "message"];

/** Satu gambar baru tiap 5 menit, sama dengan masa simpan di server. */
const bucket = () => Math.floor(Date.now() / 300_000);

/**
 * Modal "Bagikan Wenten BBM": gambar ringkasan kondisi BBM se-Bali untuk cerita, postingan, atau pesan.
 * Gambar dibuat server (/api/share/image) dari data terkini, lalu dibagikan lewat menu bagikan perangkat
 * atau diunduh bila perangkat tidak mendukung berbagi berkas.
 */
export function SnapshotShare({ onClose }: { onClose(): void }) {
  const t = useTranslations("snap");
  const locale = useLocale() as Locale;
  const places = useApp((s) => s.places);
  const statuses = useApp((s) => s.statuses);
  const [format, setFormat] = useState<Format>("story");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [stamp] = useState(bucket);

  const src = `/api/share/image?f=${format}&lang=${locale}&t=${stamp}`;
  const siteUrl = SITE_URL.replace(/\/$/, "") + (locale === "en" ? "/en" : "");

  const message = useMemo(() => {
    const s = summarizeFuel(places, statuses, 0);
    return s.reported === 0 ? t("msgNoData") : t("msgText", { n: s.withFuel, total: s.total });
  }, [places, statuses, t]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setNote(null);
  }, [format]);

  const share = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("image");
      const blob = await res.blob();
      const file = new File([blob], `wenten-bbm-${format}.png`, { type: "image/png" });
      const data: ShareData = format === "message" ? { text: message, url: siteUrl, files: [file] } : { files: [file], text: message };
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share(data);
        return;
      }
      if (format === "message") {
        // Tanpa dukungan berbagi berkas: kirim teks dan tautan lewat WhatsApp
        window.open(`https://wa.me/?text=${encodeURIComponent(`${message} ${siteUrl}`)}`, "_blank", "noopener,noreferrer");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setNote(t("downloaded"));
    } catch (err) {
      // Pengguna menutup menu bagikan: bukan kesalahan
      if (!(err instanceof DOMException && err.name === "AbortError")) setNote(t("failed"));
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${message} ${siteUrl}`);
      setNote(t("copied"));
    } catch {
      setNote(t("failed"));
    }
  };

  return (
    <>
      <div className="scrim" style={{ zIndex: 70 }} onClick={onClose} aria-hidden="true" />
      <div className="modal snap-modal" role="dialog" aria-modal="true" aria-label={t("title")}>
        <div className="modal-head">
          <h2 className="heading">{t("title")}</h2>
          <button ref={closeRef} type="button" className="btn btn-icon btn-ghost" aria-label={t("close")} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <div className="snap-tabs" role="tablist" aria-label={t("title")}>
          {FORMATS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={format === f} onClick={() => setFormat(f)}>
              {t(`tab_${f}`)}
            </button>
          ))}
        </div>

        <div className={`snap-preview ${format}`}>
          {!loaded && !failed && <div className="snap-skel" aria-busy="true" />}
          {failed && <p className="caption muted">{t("failed")}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={t("alt")}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            style={{ display: loaded ? "block" : "none" }}
          />
        </div>

        {format === "message" && <p className="snap-message">{message}</p>}
        <p className="caption muted snap-cap">{t(`cap_${format}`)}</p>
        {note && <p className="caption snap-note" role="status">{note}</p>}

        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || failed} onClick={share}>
          <Icon name="share" size={18} /> {busy ? t("preparing") : t(`btn_${format}`)}
        </button>
        {format === "message" && (
          <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={copyLink}>
            <Icon name="copy" size={16} /> {t("copyText")}
          </button>
        )}
      </div>
    </>
  );
}
