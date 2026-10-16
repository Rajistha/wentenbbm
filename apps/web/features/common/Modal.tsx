"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

/** Dialog kecil di tengah layar (pola sama dengan modal Bagikan). Esc, klik latar, atau tombol tutup menutupnya. */
export function Modal({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  onClose(): void;
  children: React.ReactNode;
}) {
  const t = useTranslations("detail");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="scrim" style={{ zIndex: 70 }} onClick={onClose} aria-hidden="true" />
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h2 className="heading">{title}</h2>
            {sub && <div className="caption muted modal-sub">{sub}</div>}
          </div>
          <button ref={closeRef} type="button" className="btn btn-icon btn-ghost" aria-label={t("close")} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
