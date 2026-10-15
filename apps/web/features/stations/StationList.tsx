"use client";
import { Icon } from "@/features/common/Icon";
import {
  ageMinutes,
  distanceM,
  effectiveStatus,
  formatDistance,
  formatRelative,
  freshness,
  googleMapsDirToPlaceUrl,
  REGION_NAMES,
  searchPlaces,
  statusRank,
  type Locale,
  type Place,
} from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { BottomSheet, type Snap } from "../common/BottomSheet";
import { RelativeTime, useNow } from "../common/RelativeTime";
import { StatusGlyph } from "../common/StatusGlyph";
import { NavigateButton } from "./NavigateButton";
import { StationPhoto } from "./StationPhoto";
import { useFuelName, useGeofence, useShare } from "./hooks";
import { useVisiblePlaces } from "./selectors";

type Sort = "distance" | "recent" | "status";
const PAGE = 40;

/** Daftar SPBU (US-01/02): bottom sheet di HP, laci kanan di desktop. */
export function StationList() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const visible = useVisiblePlaces();
  const statuses = useApp((s) => s.statuses);
  const fuelFilter = useApp((s) => s.fuelFilter);
  const onlyAvailable = useApp((s) => s.onlyAvailable);
  const user = useApp((s) => s.user);
  const focusSearch = useApp((s) => s.listFocusSearch);
  const { closePanel, select, setPrefs } = useApp.getState();
  const [q, setQ] = useState(() => useApp.getState().listQuery);
  const [sort, setSort] = useState<Sort>("distance");
  const [limit, setLimit] = useState(PAGE);
  const [snap, setSnap] = useState<Snap>("half");
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  useEffect(() => {
    if (useApp.getState().listQuery) useApp.setState({ listQuery: "" });
  }, []);
  useEffect(() => {
    if (focusSearch) searchRef.current?.focus();
  }, [focusSearch]);
  useEffect(() => setLimit(PAGE), [q, sort, fuelFilter, onlyAvailable]);

  const rows = useMemo(() => {
    const found = searchPlaces(visible, q, REGION_NAMES);
    const withMeta = found.map((p) => {
      const e = effectiveStatus(statuses.get(p.id), fuelFilter);
      return { p, e, d: user ? distanceM(user, p) : null };
    });
    withMeta.sort((a, b) => {
      // Belum ada laporan selalu di belakang SPBU yang berstatus (DESIGN.md 7.4)
      const ua = a.e.status === "unknown" ? 1 : 0;
      const ub = b.e.status === "unknown" ? 1 : 0;
      if (ua !== ub) return ua - ub;
      if (sort === "status") {
        const r = statusRank(a.e.status) - statusRank(b.e.status);
        if (r) return r;
      }
      if (sort === "recent") {
        return (b.e.lastReportAt ?? "").localeCompare(a.e.lastReportAt ?? "");
      }
      if (a.d != null && b.d != null) return a.d - b.d;
      // Tanpa lokasi: SPBU dulu, baru Pertashop dan pengecer
      const kr = { spbu: 0, pertashop: 1, retailer: 2, terminal: 3 };
      return kr[a.p.kind] - kr[b.p.kind] || a.p.name.localeCompare(b.p.name);
    });
    return withMeta;
  }, [visible, q, statuses, fuelFilter, user, sort]);

  const nearbyAvailable = user
    ? rows.filter((r) => r.d != null && r.d < 5000 && (r.e.status === "available" || r.e.status === "limited")).length
    : null;

  const header = (
    <>
      <div className="sheet-header">
        <div className="grow">
          <h2 className="heading">{t("list.title")}</h2>
          <div className="caption muted">{t("list.count", { n: rows.length })}</div>
        </div>
        <button type="button" className="btn btn-icon btn-ghost" aria-label={t("detail.close")} onClick={closePanel}>
          <Icon name="close" />
        </button>
      </div>
      <div className="list-tools">
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">{t("list.search")}</span>
          <input
            ref={searchRef}
            type="search"
            value={q}
            placeholder={t("list.search")}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
          />
        </label>
        <div className="chip-row">
          {(["distance", "recent", "status"] as Sort[]).map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={sort === s} onClick={() => setSort(s)}>
              {t(`list.sort${s[0]!.toUpperCase()}${s.slice(1)}` as "list.sortDistance")}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={onlyAvailable} onClick={() => setPrefs({ onlyAvailable: !onlyAvailable })}>
            {onlyAvailable && <Icon name="check" size={14} />}
            {t("list.onlyAvailable")}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <BottomSheet label={t("list.title")} header={header} onClose={closePanel} initial="half" onSnapChange={setSnap}>
        {nearbyAvailable === 0 && !q && <p className="form-error">{t("list.noneNearby")}</p>}
        {!rows.length && <p className="muted">{t("list.empty")}</p>}
        {rows.slice(0, limit).map(({ p, e, d }) => (
          <ListItem
            key={p.id}
            place={p}
            distance={d}
            locale={locale}
            now={now}
            onOpen={() => select(p.id, { open: true, fly: true, fromList: true })}
          />
        ))}
        {rows.length > limit && (
          <button type="button" className="btn btn-block" onClick={() => setLimit((l) => l + PAGE)}>
            {t("list.more", { n: Math.min(PAGE, rows.length - limit) })}
          </button>
        )}
      </BottomSheet>
      {snap === "full" && (
        <button type="button" className="btn btn-primary see-map" onClick={closePanel}>
          <Icon name="locate" /> {t("list.backToMap")}
        </button>
      )}
    </>
  );
}

/** Kartu SPBU: foto, status, ringkasan BBM, dan aksi cepat (lapor, arahkan, bagikan) langsung di daftar. */
function ListItem({ place, distance, locale, now, onOpen }: { place: Place; distance: number | null; locale: Locale; now: number; onOpen(): void }) {
  const t = useTranslations();
  const fuelName = useFuelName();
  const share = useShare();
  const geo = useGeofence(place);
  const status = useApp((s) => s.statuses.get(place.id));
  const fuelFilter = useApp((s) => s.fuelFilter);
  const readOnly = useApp((s) => s.readOnly);
  const e = effectiveStatus(status, fuelFilter);
  const stale = freshness(ageMinutes(e.lastReportAt, now)) === "stale";
  const canReport = geo.ok && !readOnly;
  // Jenis BBM yang difilter selalu tampil pertama, maksimal empat
  const allFuels = [...(status?.fuels ?? [])].sort((a, b) =>
    a.fuelTypeId === fuelFilter ? -1 : b.fuelTypeId === fuelFilter ? 1 : a.fuelTypeId - b.fuelTypeId,
  );
  const fuels = allFuels.slice(0, 4);
  const queueN = status?.queue ? { none: 0, short: 1, medium: 2, long: 3 }[status.queue] : 0;
  const label = `${place.name}, ${t(`status.${e.status}`)}${distance != null ? `, ${formatDistance(distance, locale)}` : ""}`;

  const report = (preset: "available" | "empty") => {
    const { showToast, select, startReport } = useApp.getState();
    if (readOnly) return showToast(t("banners.readOnly"));
    if (!geo.ok) return showToast(geo.reason === "low_accuracy" ? t("location.lowAccuracy") : t("detail.reportNeedNear"));
    select(place.id, { fly: true });
    startReport(preset);
  };

  return (
    <div
      className="sc"
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.target !== ev.currentTarget) return;
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="sc-top">
        {place.kind !== "terminal" && <StationPhoto slug={place.slug} name={place.name} variant="thumb" />}
        <div className="sc-main">
          <div className="sc-name">{place.name}</div>
          {place.code && <div className="sc-code">{place.code}</div>}
          <div className="sc-line">
            {distance != null && <strong>{formatDistance(distance, locale)}</strong>}
            {distance != null && place.address ? " · " : ""}
            {place.address}
          </div>
          {place.is24h && (
            <div className="sc-meta">
              <Icon name="clock" size={13} /> {t("detail.h24")}
            </div>
          )}
        </div>
      </div>

      <div className="sc-pills">
        <span className={`pill pill-${e.status}`}>
          <StatusGlyph status={e.status} size={16} confirmed={e.confirmed} />
          {t(`status.${e.status}`)}
        </span>
        {stale && (
          <span className="pill pill-muted">
            <Icon name="clock" size={13} /> {t("list.oldReports")}
          </span>
        )}
        {e.confirmed && (
          <span className="pill pill-muted">
            <Icon name="verified" size={13} /> {t("status.confirmed")}
          </span>
        )}
        {status?.queue && (
          <span className="pill pill-muted">
            {queueN > 0 ? Array.from({ length: queueN }, (_, i) => <Icon key={i} name="car" size={13} />) : <Icon name="check" size={13} />}
            {t(`queue.${status.queue}`)}
          </span>
        )}
      </div>

      <div className="sc-last">
        {e.lastReportAt ? (
          <>
            {t("detail.lastReport", { t: "" })}
            <RelativeTime at={e.lastReportAt} />
          </>
        ) : (
          t("list.beFirst")
        )}
      </div>

      {fuels.length > 0 && (
        <div className="sc-fuels">
          {fuels.map((fs) => (
            <span key={fs.fuelTypeId} className="fchip">
              <StatusGlyph status={fs.status} size={14} />
              {fuelName(fs.fuelTypeId)} · {t(`status.short_${fs.status}`)}
            </span>
          ))}
          {allFuels.length > fuels.length && <span className="fchip muted">+{allFuels.length - fuels.length}</span>}
        </div>
      )}

      {place.kind !== "terminal" && (
        <div className="sc-actions" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
          <button type="button" className={`act act-yes${canReport ? "" : " off"}`} aria-disabled={!canReport} onClick={() => report("available")}>
            <Icon name="check" size={18} /> {t("list.hereYes")}
          </button>
          <button type="button" className={`act act-no${canReport ? "" : " off"}`} aria-disabled={!canReport} onClick={() => report("empty")}>
            <Icon name="close" size={18} /> {t("list.hereNo")}
          </button>
          <a
            className="act act-go"
            href={googleMapsDirToPlaceUrl(place)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("detail.navigate")}
          >
            <Icon name="navigate" size={20} />
          </a>
          <button
            type="button"
            className="act act-share"
            aria-label={t("detail.share")}
            onClick={() => share(`/spbu/${place.slug}`, t("share.stationText", { name: place.name, status: t(`status.${e.status}`), t: e.lastReportAt ? formatRelative(e.lastReportAt, locale) : "-" }), place.name, place.slug)}
          >
            <Icon name="share" size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
