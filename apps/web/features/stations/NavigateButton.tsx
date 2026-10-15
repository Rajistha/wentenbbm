"use client";
import { Icon } from "@/features/common/Icon";
import { geoUri, googleMapsDirToCoordsUrl, googleMapsDirToPlaceUrl, type Place } from "@wenten/core";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";

interface Props {
  place: Place;
  compact?: boolean;
  highlight?: boolean;
  withMenu?: boolean;
}

/** Tombol "Arahkan" ke Google Maps (US-04), plus aplikasi peta lain dan salin koordinat. */
export function NavigateButton({ place, compact, highlight, withMenu }: Props) {
  const { lat, lng, name } = place;
  const t = useTranslations("detail");
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const showToast = useApp((s) => s.showToast);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const link = (
    <a
      className={`btn btn-primary${compact ? "" : " btn-lg"}${highlight ? " btn-highlight" : ""}`}
      href={googleMapsDirToPlaceUrl(place)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      style={withMenu ? { flex: 1 } : undefined}
    >
      <Icon name="navigate" /> {t("navigate")}
    </a>
  );
  if (!withMenu) return link;

  return (
    <div ref={wrap} style={{ position: "relative", display: "flex", gap: 8, flex: 1 }}>
      {link}
      <button
        type="button"
        className="btn btn-icon"
        aria-label={t("moreNav")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu" role="menu" style={{ top: "calc(100% + 4px)", left: 0 }}>
          <a role="menuitem" href={geoUri({ lat, lng }, name)}>
            <Icon name="locate" /> {t("otherApp")}
          </a>
          <a role="menuitem" href={googleMapsDirToCoordsUrl({ lat, lng })} target="_blank" rel="noopener noreferrer">
            <Icon name="pin" /> {t("navCoords")}
          </a>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${lat}, ${lng}`);
                showToast(t("copied"));
              } catch {
                window.prompt("", `${lat}, ${lng}`);
              }
              setOpen(false);
            }}
          >
            <Icon name="copy" /> {t("copyCoords")}
          </button>
        </div>
      )}
    </div>
  );
}
