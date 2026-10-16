"use client";
import { Icon } from "@/features/common/Icon";
import { ageMinutes, distanceM, formatDistance, freshness, type Locale } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useApp } from "@/lib/store";
import { RelativeTime, useNow } from "../common/RelativeTime";
import { StatusGlyph } from "../common/StatusGlyph";
import { NavigateButton } from "./NavigateButton";
import { useFuelName, useStationStatus } from "./hooks";
import { OpeningNote, ReportCountNote } from "./StationNotes";

/** Popup ringkas yang menempel pada penanda (desktop). */
export function StationPopup({ id }: { id: string }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const place = useApp((s) => s.placeById.get(id));
  const user = useApp((s) => s.user);
  const highlight = useApp((s) => s.highlightNavigate);
  const openPanel = useApp((s) => s.openPanel);
  const select = useApp((s) => s.select);
  const { status, effective } = useStationStatus(id);
  const fuelName = useFuelName();
  const now = useNow();
  if (!place) return null;
  const stale = freshness(ageMinutes(effective.lastReportAt, now)) === "stale";

  return (
    <div className="popup-inner">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="heading">{place.name}</h2>
          <div className="caption muted">
            {[place.code, user ? formatDistance(distanceM(user, place), locale) : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button type="button" className="btn btn-icon btn-ghost" aria-label={t("detail.close")} onClick={() => select(null)}>
          <Icon name="close" />
        </button>
      </div>
      <div className="status-inline">
        <StatusGlyph status={effective.status} size={18} confirmed={effective.confirmed} stale={stale} />
        {t(`status.${effective.status}`)}
        {effective.confirmed && <span className="badge">{t("status.confirmed")}</span>}
      </div>
      {effective.lastReportAt ? (
        <div className="caption muted">
          <Icon name="clock" size={13} style={{ verticalAlign: "-2px" }} /> <RelativeTime at={effective.lastReportAt} />
          {stale && ` · ${t("status.stale")}`}
          {status?.reports3h ? " · " : ""}
          <ReportCountNote status={status} />
        </div>
      ) : (
        <div className="caption muted">{t("detail.noReport")}</div>
      )}
      <OpeningNote place={place} />
      {status && status.fuels.length > 0 && (
        <div className="caption">
          {status.fuels
            .slice(0, 3)
            .map((f) => `${t(`status.short_${f.status}`)} ${fuelName(f.fuelTypeId)}`)
            .join(" · ")}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <NavigateButton place={place} compact highlight={highlight} withMenu />
        <button type="button" className="btn" onClick={() => openPanel("detail")}>
          {t("detail.open")}
        </button>
      </div>
    </div>
  );
}
