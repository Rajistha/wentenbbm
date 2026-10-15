"use client";
import { useTranslations } from "next-intl";
import { StatusGlyph } from "../common/StatusGlyph";

export function LegendList() {
  const t = useTranslations();
  return (
    <ul>
      <li>
        <StatusGlyph status="available" size={18} /> {t("status.available")}
      </li>
      <li>
        <StatusGlyph status="limited" size={18} /> {t("status.limited")}
      </li>
      <li>
        <StatusGlyph status="empty" size={18} /> {t("status.empty")}
      </li>
      <li>
        <StatusGlyph status="unknown" size={18} /> {t("status.unknown")}
      </li>
      <li>
        <StatusGlyph status="available" size={18} confirmed /> {t("status.confirmed")}
      </li>
      <li>
        <svg className="glyph" width="18" height="18" viewBox="-12 -12 24 24" aria-hidden="true">
          <rect x="-10.5" y="-10.5" width="21" height="21" rx="5" fill="var(--status-available)" />
          <g transform="scale(0.72)" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M-6,8.5 V-7 a2,2 0 0 1 2,-2 h6 a2,2 0 0 1 2,2 V8.5 M-7.5,8.5 H5.5" /><path d="M-4,-4.5 H3" /><path d="M7.5,-2 h1 a1.6,1.6 0 0 1 1.6,1.6 V5 a1.5,1.5 0 0 0 3,0 V-3.5 L10.2,-6" /></g>
        </svg>
        {t("legend.retail")}
      </li>
      <li>
        <svg className="glyph" width="20" height="20" viewBox="-16 -16 32 32" aria-hidden="true">
          <path d="M0,-14 L14,0 L0,14 L-14,0 Z" fill="#334155" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
          <rect x="-5" y="-3" width="10" height="8" rx="1.5" fill="#fff" />
        </svg>
        {t("legend.terminal")}
      </li>
    </ul>
  );
}

/** Legenda kiri bawah di desktop, bisa dibuka tutup (DESIGN.md 7.3). Di HP ada di menu ⓘ. */
export function MapLegend() {
  const t = useTranslations("legend");
  return (
    <details className="float-card legend legend-desktop" open>
      <summary className="label" style={{ cursor: "pointer" }}>
        {t("title")}
      </summary>
      <LegendList />
    </details>
  );
}
