"use client";
import { formatWita, type Locale } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { DashboardPayload } from "@/lib/types";

type Row = DashboardPayload["hourly"][number];

/** Bar bertumpuk Ada / Terbatas / Habis per jam, dengan alternatif tabel (DESIGN.md 12.2). */
export function HourlyChart({ rows }: { rows: Row[] }) {
  const t = useTranslations("data");
  const ts = useTranslations("status");
  const locale = useLocale() as Locale;
  const host = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState(false);

  const peak = useMemo(() => {
    let best: Row | undefined;
    for (const r of rows) if (!best || r[1] + r[2] + r[3] > best[1] + best[2] + best[3]) best = r;
    return best;
  }, [rows]);
  const summary = peak ? t("peak", { time: formatWita(peak[0], locale), n: peak[1] + peak[2] + peak[3] }) : "";

  useEffect(() => {
    if (table || !host.current || !rows.length) return;
    const el = host.current;
    const cs = getComputedStyle(document.documentElement);
    const col = (n: string) => cs.getPropertyValue(n).trim();
    const colors = [col("--chart-available"), col("--chart-limited"), col("--chart-empty")];
    const x = rows.map((r) => new Date(r[0]).getTime() / 1000);
    // Tumpukan: kumulatif dari bawah (Habis, Terbatas, Ada)
    const empty = rows.map((r) => r[3]);
    const limited = rows.map((r, i) => r[2] + empty[i]!);
    const avail = rows.map((r, i) => r[1] + limited[i]!);

    const barPath = uPlot.paths.bars!({ size: [0.8, 40], radius: 0 });
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height: 240,
      padding: [8, 8, 0, 0],
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(10, max * 1.08)] } },
      axes: [
        { stroke: col("--text-muted"), grid: { stroke: col("--border") }, ticks: { show: false }, font: "12px sans-serif" },
        { stroke: col("--text-muted"), grid: { stroke: col("--border") }, ticks: { show: false }, font: "12px sans-serif", size: 48 },
      ],
      series: [
        {},
        { label: ts("available"), stroke: colors[0], fill: colors[0], paths: barPath, points: { show: false } },
        { label: ts("limited"), stroke: colors[1], fill: colors[1], paths: barPath, points: { show: false } },
        { label: ts("empty"), stroke: colors[2], fill: colors[2], paths: barPath, points: { show: false } },
      ],
    };
    const plot = new uPlot(opts, [x, avail, limited, empty], el);
    const ro = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height: 240 }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
    };
  }, [rows, table, ts]);

  return (
    <div>
      <div className="legend-inline">
        <span>
          <i className="swatch" style={{ background: "var(--chart-available)" }} /> {ts("available")}
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--chart-limited)" }} /> {ts("limited")}
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--chart-empty)" }} /> {ts("empty")}
        </span>
        <span>{t("hourlyLegend")}</span>
      </div>
      {table ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("hour")}</th>
                <th>{ts("available")}</th>
                <th>{ts("limited")}</th>
                <th>{ts("empty")}</th>
                <th>{t("total")}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r[0]}>
                  <td>{formatWita(r[0], locale, true)}</td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>{r[3]}</td>
                  <td>{r[1] + r[2] + r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={host} role="img" aria-label={t("hourly")} aria-describedby="hourly-summary" />
      )}
      <p id="hourly-summary" className="caption muted">
        {summary}
      </p>
      <button type="button" className="link-btn" onClick={() => setTable((v) => !v)}>
        {table ? t("showChart") : t("showTable")}
      </button>
    </div>
  );
}
