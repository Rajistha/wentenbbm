"use client";
import { countStatuses, formatNumber, type FuelStatus, type Locale } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { StatusGlyph } from "../common/StatusGlyph";

const ORDER: FuelStatus[] = ["available", "limited", "empty", "unknown"];

/** Strip status: bar proporsi tersegmen + angka, sekaligus filter cepat (DESIGN.md 7.1). */
export function StatusStrip() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const places = useApp((s) => s.places);
  const statuses = useApp((s) => s.statuses);
  const fuelFilter = useApp((s) => s.fuelFilter);
  const fuelTypes = useApp((s) => s.fuelTypes);
  const active = useApp((s) => s.statusFilter);
  const setStatusFilter = useApp((s) => s.setStatusFilter);

  const counts = useMemo(() => countStatuses(places, statuses, fuelFilter), [places, statuses, fuelFilter]);
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return <div className="float-card strip" style={{ minHeight: 76 }} aria-busy="true" />;

  const fuelName = fuelFilter === "all" ? null : fuelTypes.find((f) => f.id === fuelFilter)?.name;
  const summary = fuelName
    ? t("strip.summary", { a: formatNumber(counts[0], locale), total: formatNumber(total, locale), fuel: fuelName })
    : t("strip.summaryAll", { a: formatNumber(counts[0], locale), total: formatNumber(total, locale) });

  return (
    <div className="float-card strip">
      <div className="strip-bar" role="presentation">
        {ORDER.map((s, i) =>
          counts[i]! > 0 ? (
            <button
              key={s}
              type="button"
              className={`seg-${s}`}
              style={{ flex: counts[i]! }}
              aria-label={`${t(`status.${s}`)}: ${counts[i]}`}
              onClick={() => setStatusFilter(active === s ? null : s)}
              tabIndex={-1}
            />
          ) : null,
        )}
      </div>
      <div className="strip-counts" role="group" aria-label={t("strip.clear")}>
        {ORDER.map((s, i) => (
          <button
            key={s}
            type="button"
            className="strip-count"
            aria-pressed={active === s}
            title={t("strip.filterHint", { status: t(`status.${s}`).toLowerCase() })}
            aria-label={`${t(`status.${s}`)}: ${counts[i]}`}
            onClick={() => setStatusFilter(active === s ? null : s)}
          >
            <StatusGlyph status={s} size={16} />
            <span className="tnum">{formatNumber(counts[i]!, locale)}</span>
          </button>
        ))}
      </div>
      <div className="strip-summary">{summary}</div>
    </div>
  );
}
