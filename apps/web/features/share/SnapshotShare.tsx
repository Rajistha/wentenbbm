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
 * Gambar dibuat server (/api/share/image) dari data terkini dan diunduh ke memori lebih dulu, sehingga
 * tombol bagikan langsung membuka menu bagikan perangkat (Instagram, WhatsApp, aplikasi lain) dalam
 * ketukan yang sama. Perangkat tanpa menu bagikan berkas mengunduh gambar (atau membuka WhatsApp untuk pesan).
 */
export interface StationShareInfo {
  slug: string;
  name: string;
  /** Kalimat siap kirim tentang status SPBU. */
  text: string;
  /** Jalur halaman SPBU, mis. /spbu/spbu-panjer. */
  url: string;
}

export function SnapshotShare({ onClose, station, onQr }: { onClose(): void; station?: StationShareInfo; onQr?(): void }) {
  const t = useTranslations("snap");
  const locale = useLocale() as Locale;
  const places = useApp((s) => s.places);
  const statuses = useApp((s) => s.statuses);
  const [format, setFormat] = useState<Format>("story");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [stamp] = useState(bucket);

  const src = `/api/share/image?f=${format}&lang=${locale}&t=${stamp}${station ? `&spbu=${encodeURIComponent(station.slug)}` : ""}`;
  const base = SITE_URL.replace(/\/$/, "") + (locale === "en" ? "/en" : "");
  const siteUrl = station ? base + station.url : base;

  const message = useMemo(() => {
    if (station) return station.text;
    const s = summarizeFuel(places, statuses, 0);
    return s.reported === 0 ? t("msgNoData") : t("msgText", { n: s.withFuel, total: s.total });
  }, [places, statuses, t, station]);

  // Unduh gambar ke memori tiap kali format berganti; dipakai untuk pratinjau dan untuk dibagikan
  useEffect(() => {
    let alive = true;
    setBlob(null);
    setFailed(false);
    setNote(null);
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("image"))))
      .then((b) => alive && setBlob(b))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [src]);

  const preview = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const downloadFile = (file: File) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    setNote(t("downloaded"));
  };

  // Dipanggil langsung dari klik: navigator.share dijalankan sebelum await apa pun (syarat izin ketukan)
  const share = async () => {
    if (!blob) return;
    setNote(null);
    const file = new File([blob], `wenten-bbm-${format}.png`, { type: "image/png" });
    const data: ShareData = format === "message" ? { text: message, url: siteUrl, files: [file] } : { files: [file], text: `${message} ${siteUrl}` };
    setBusy(true);
    try {
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share(data);
        return;
      }
      if (format === "message") {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${message} ${siteUrl}`)}`, "_blank", "noopener,noreferrer");
        return;
      }
      downloadFile(file);
    } catch (err) {
      // Pengguna menutup menu bagikan: bukan kesalahan. Galat lain: unduh gambarnya saja.
      if (!(err instanceof DOMException && err.name === "AbortError")) downloadFile(file);
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
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
          <div>
            <h2 className="heading">{station ? t("titleStation") : t("title")}</h2>
            {station && <div className="caption muted">{station.name}</div>}
          </div>
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
          {!preview && !failed && <div className="snap-skel" aria-busy="true" />}
          {failed && <p className="caption muted">{t("failed")}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt={t("alt")} />}
        </div>

        {format === "message" && <p className="snap-message">{message}</p>}
        <p className="caption muted snap-cap">{t(`cap_${format}`)}</p>
        {note && (
          <p className="caption snap-note" role="status">
            {note}
          </p>
        )}

        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || !blob} onClick={share}>
          <Icon name="share" size={18} /> {!blob && !failed ? t("preparing") : t(`btn_${format}`)}
        </button>
        {onQr && (
          <button type="button" className="btn btn-block" style={{ marginTop: format === "message" ? 0 : 8 }} onClick={onQr}>
            <Icon name="pin" size={16} /> {t("qrLink")}
          </button>
        )}
        {format === "message" && (
          <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={copyText}>
            <Icon name="copy" size={16} /> {t("copyText")}
          </button>
        )}
      </div>
    </>
  );
}
