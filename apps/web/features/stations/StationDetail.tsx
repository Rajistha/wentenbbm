"use client";
import { Icon } from "@/features/common/Icon";
import { ageMinutes, distanceM, formatDistance, freshness, type FuelStatus, type Locale } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { simulateLocation } from "@/lib/geolocation";
import { useApp } from "@/lib/store";
import { BottomSheet } from "../common/BottomSheet";
import { QueueIndicator } from "../common/QueueIndicator";
import { RelativeTime, useNow } from "../common/RelativeTime";
import { StatusGlyph } from "../common/StatusGlyph";
import { NavigateButton } from "./NavigateButton";
import { FavoriteButton } from "./FavoriteButton";
import { QueueJoin } from "../queue/QueueBar";
import { formatRupiah, StationActions, useStationPrices } from "./StationActions";
import { OpeningNote, QueuingNote, ReportCountNote } from "./StationNotes";
import { StationPhoto } from "./StationPhoto";
import { TrafficRow } from "./TrafficRow";
import { RecentReports } from "./RecentReports";
import { useGeofence, useShare, useStationStatus } from "./hooks";

/** Detail SPBU (US-03): bottom sheet di HP, laci kanan di desktop. */
export function StationDetail() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const id = useApp((s) => s.selectedId);
  const place = useApp((s) => (s.selectedId ? s.placeById.get(s.selectedId) : undefined));
  const fuelTypes = useApp((s) => s.fuelTypes);
  const user = useApp((s) => s.user);
  const demo = useApp((s) => s.demo);
  const isPending = useApp((s) => (s.selectedId ? s.pendingIds.includes(s.selectedId) : false));
  const readOnly = useApp((s) => s.readOnly);
  const highlight = useApp((s) => s.highlightNavigate);
  const fromList = useApp((s) => s.detailFromList);
  const { select, openPanel, showToast } = useApp.getState();
  const { status } = useStationStatus(id);
  const geo = useGeofence(place ?? null);
  const share = useShare();
  const now = useNow();
  const [hint, setHint] = useState<string | null>(null);
  const prices = useStationPrices(id).data;

  if (!place) return null;
  const overall: FuelStatus = status?.overall ?? "unknown";
  const overallAge = ageMinutes(status?.lastReportAt, now);
  const fr = freshness(overallAge);
  const fuels = fuelTypes.filter((f) => place.fuelIds.includes(f.id));

  const onReport = (preset: "available" | "limited" | "empty") => {
    if (readOnly) return setHint(t("banners.readOnly"));
    if (geo.ok) return useApp.getState().startReport(preset);
    setHint(geo.reason === "low_accuracy" ? t("location.lowAccuracy") : t("detail.reportNeedNear"));
  };

  const onShare = () =>
    share(
      `/spbu/${place.slug}`,
      t("share.stationText", {
        name: place.name,
        status: t(`status.${overall}`),
        t: status?.lastReportAt ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-Math.round(overallAge ?? 0), "minute") : "-",
      }),
      place.name,
      place.slug,
    );

  const header = (
    <div className="sheet-header">
      {fromList && (
        <button type="button" className="btn btn-icon btn-ghost" aria-label={t("detail.back")} onClick={() => openPanel("list")}>
          <Icon name="back" />
        </button>
      )}
      <div className="grow">
        <h2 className="title">{place.name}</h2>
        <div className="caption muted">
          {[place.brand === "none" ? null : place.brand[0]!.toUpperCase() + place.brand.slice(1), place.code]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <OpeningNote place={place} />
        <QueuingNote status={status} />
        <div className="caption muted">
          {[place.address, user ? formatDistance(distanceM(user, place), locale) : null].filter(Boolean).join(" · ")}
        </div>
      </div>
      <FavoriteButton id={place.id} />
      <button type="button" className="btn btn-icon btn-ghost" aria-label={t("detail.close")} onClick={() => select(null)}>
        <Icon name="close" />
      </button>
    </div>
  );

  return (
    <BottomSheet label={place.name} header={header} onClose={() => select(null)} initial="half">
      {isPending && (
        <p className="form-error" role="status" style={{ marginTop: 12 }}>
          {t("add.pendingBadge")}
        </p>
      )}
      <StationPhoto slug={place.slug} name={place.name} variant="banner" />
      <div className="detail-status">
        <StatusGlyph status={overall} size={28} confirmed={status?.confirmed} stale={fr === "stale"} />
        <span className="title">{t(`status.${overall}`)}</span>
        {status?.confirmed && <span className="badge"><Icon name="verified" size={13} /> {t("status.confirmed")}</span>}
        {fr === "new" && <span className="badge">{t("status.new")}</span>}
      </div>
      <div className="caption muted">
        {status?.lastReportAt ? (
          <>
            <Icon name="clock" size={14} style={{ verticalAlign: "-2px" }} /> {t("detail.lastReport", { t: "" })}
            <RelativeTime at={status.lastReportAt} />
            {fr === "stale" && ` · ${t("status.stale")}`}
            {status.reports3h ? " · " : ""}
            <ReportCountNote status={status} />
          </>
        ) : (
          t("detail.noReport")
        )}
      </div>

      <table className="fuel-table">
        <caption className="sr-only">{t("detail.fuels")}</caption>
        <tbody>
          {fuels.map((f) => {
            const fs = status?.fuels.find((x) => x.fuelTypeId === f.id);
            const st = fs?.status ?? "unknown";
            const stale = freshness(ageMinutes(fs?.lastReportAt, now)) === "stale";
            return (
              <tr key={f.id}>
                <td>
                  {f.name}
                  {prices?.get(f.id) && (
                    <div className="caption muted tnum" title={t("more.priceFrom", { n: prices.get(f.id)!.n })}>
                      {formatRupiah(prices.get(f.id)!.price, locale)}
                    </div>
                  )}
                </td>
                <td>
                  <span className="status-inline">
                    <StatusGlyph status={st} size={15} confirmed={fs?.confirmed} stale={stale} />
                    {t(`status.short_${st}`)}
                  </span>
                </td>
                <td>{fs?.lastReportAt ? <RelativeTime at={fs.lastReportAt} /> : "-"}</td>
              </tr>
            );
          })}
          <tr>
            <td>{t("queue.label")}</td>
            <td colSpan={2} style={{ textAlign: "left", color: "inherit" }}>
              <QueueIndicator level={status?.queue ?? null} />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="caption muted" style={{ margin: "0 0 8px" }}>
        {status?.waitLow != null && status.waitHigh != null
          ? t("detail.waitEstimate", { low: status.waitLow, high: Math.max(status.waitHigh, status.waitLow + 5) })
          : t("detail.waitNotEnough")}
      </p>

      {place.kind !== "terminal" && <TrafficRow slug={place.slug} />}
      <QueueJoin place={place} />

      <div className="action-row">
        <NavigateButton place={place} highlight={highlight} withMenu />
        <button type="button" className="btn btn-icon btn-lg" aria-label={t("detail.share")} onClick={onShare}>
          <Icon name="share" />
        </button>
      </div>
      <section className="help-box" aria-labelledby="help-t">
        <h3 id="help-t" className="section-title" style={{ margin: "0 0 8px" }}>
          {t("detail.helpTitle")}
        </h3>
        <div className="help-btns">
          <button type="button" className="help-btn yes" aria-disabled={!geo.ok || readOnly} onClick={() => onReport("available")}>
            <Icon name="check" size={20} /> {t("detail.hereYes")}
          </button>
          <button type="button" className="help-btn no" aria-disabled={!geo.ok || readOnly} onClick={() => onReport("empty")}>
            <Icon name="close" size={20} /> {t("detail.hereNo")}
          </button>
        </div>
        <button type="button" className="link-btn" style={{ marginTop: 8 }} aria-disabled={!geo.ok || readOnly} onClick={() => onReport("limited")}>
          {t("detail.hereLimited")}
        </button>
        {!geo.ok && <p className="caption muted" style={{ margin: "8px 0 0" }}>{t("detail.reportNeedNear")}</p>}
      </section>
      <StationActions place={place} />
      {hint && (
        <p className="form-error" role="status">
          {hint}
        </p>
      )}
      {demo && !geo.ok && (
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            simulateLocation(place.lat + 0.0002, place.lng + 0.0002);
            setHint(null);
            showToast(t("detail.demoHereDone", { name: place.name }));
          }}
        >
          {t("detail.demoHere")}
        </button>
      )}

      <h3 className="section-title">{t("detail.recent")}</h3>
      <RecentReports place={place} />

      <p className="disclaimer">
        <Icon name="info" />
        {t("detail.disclaimer")}
      </p>
    </BottomSheet>
  );
}
