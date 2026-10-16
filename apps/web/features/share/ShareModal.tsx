"use client";
import QRCode from "qrcode";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useApp } from "@/lib/store";
import { Icon } from "../common/Icon";

/** Modal bagikan: kode QR (bisa diunduh untuk dicetak), salin tautan, dan bagikan lewat aplikasi. */
export function ShareModal() {
  const t = useTranslations("share");
  const target = useApp((s) => s.shareTarget);
  const close = useApp((s) => s.closeShare);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const url = target ? new URL(target.url, typeof window === "undefined" ? "http://localhost" : window.location.origin).toString() : "";

  useEffect(() => {
    if (!target) return;
    setCopied(false);
    setQr(null);
    let alive = true;
    // Resolusi tinggi agar tetap tajam saat dicetak
    QRCode.toDataURL(url, { margin: 2, width: 720, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [target, url, close]);

  if (!target) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // cadangan untuk browser tanpa izin clipboard
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <>
      <div className="scrim" style={{ zIndex: 70 }} onClick={close} aria-hidden="true" />
      <div className="modal" role="dialog" aria-modal="true" aria-label={t("title")}>
        <div className="modal-head">
          <div>
            <h2 className="heading">{t("title")}</h2>
            <div className="caption muted modal-sub">{target.title}</div>
          </div>
          <button ref={closeRef} type="button" className="btn btn-icon btn-ghost" aria-label={t("close")} onClick={close}>
            <Icon name="close" />
          </button>
        </div>

        <div className="qr-box">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={t("qrAlt", { name: target.title })} width={220} height={220} />
          ) : (
            <div className="qr-skel" aria-busy="true" />
          )}
        </div>
        <p className="caption muted" style={{ textAlign: "center", margin: "8px 0 14px" }}>
          {t("qrHint")}
        </p>

        <div className="link-field">
          <input readOnly value={url} aria-label={t("link")} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className={`btn ${copied ? "" : "btn-primary"}`} onClick={copy}>
            <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? t("copiedShort") : t("copyLink")}
          </button>
        </div>

        <div className="modal-actions">
          <a
            className="btn"
            href={`https://wa.me/?text=${encodeURIComponent(`${target.text} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="share" size={16} /> WhatsApp
          </a>
          {canNativeShare && (
            <button
              type="button"
              className="btn"
              onClick={() => navigator.share({ title: target.title, text: target.text, url }).catch(() => {})}
            >
              <Icon name="share" size={16} /> {t("viaApp")}
            </button>
          )}
          <Link className="btn" href={target.slug ? `/poster?spbu=${target.slug}` : "/poster"} onClick={close}>
            <Icon name="printer" size={16} /> {t("poster")}
          </Link>
          {qr && (
            <a className="btn" href={qr} download={`wenten-bbm-${target.slug ?? "qr"}.png`}>
              <Icon name="next" size={16} style={{ transform: "rotate(90deg)" }} /> {t("downloadQr")}
            </a>
          )}
        </div>
      </div>
    </>
  );
}
