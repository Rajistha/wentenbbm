"use client";
import { useTranslations } from "next-intl";
import { useApp } from "@/lib/store";
import { Icon } from "../common/Icon";

/** Kolom cari ala Google Maps di atas peta. Mengetuknya membuka panel pencarian. */
export function SearchBar() {
  const t = useTranslations("search");
  const pin = useApp((s) => s.searchPin);
  const openPanel = useApp((s) => s.openPanel);
  const setSearchPin = useApp((s) => s.setSearchPin);

  return (
    <div className="float-card search-pill" id="search-pill">
      <button type="button" className="search-pill-main" onClick={() => openPanel("search")} aria-label={t("placeholder")}>
        <Icon name="search" size={20} />
        <span className={pin ? "" : "muted"}>{pin ? pin.name : t("placeholder")}</span>
      </button>
      {pin && (
        <button type="button" className="btn btn-icon btn-ghost" style={{ width: 36, minHeight: 36 }} aria-label={t("clearPin")} onClick={() => setSearchPin(null)}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
