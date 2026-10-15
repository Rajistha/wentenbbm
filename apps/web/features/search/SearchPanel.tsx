"use client";
import {
  ageMinutes,
  deriveStreets,
  distanceM,
  effectiveStatus,
  formatDistance,
  formatRelative,
  REGION_NAMES,
  searchGazetteer,
  searchStations,
  type GazetteerEntry,
  type Locale,
  type Place,
} from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearRecent, getRecent, loadGazetteer, removeRecent, saveRecent, type RecentItem } from "@/lib/gazetteer";
import { useApp } from "@/lib/store";
import { Icon, type IconName } from "../common/Icon";
import { StatusGlyph } from "../common/StatusGlyph";
import { useIsDesktop } from "../common/useMedia";
import { mapApi } from "../map/mapApi";

type Row =
  | { key: string; type: "station"; place: Place; near?: boolean }
  | { key: string; type: "place"; entry: GazetteerEntry }
  | { key: string; type: "recent"; item: RecentItem };

const ZOOM: Record<GazetteerEntry["type"], number> = { region: 11, city: 13, town: 13.5, suburb: 14, village: 14, neighbourhood: 15, street: 15, terminal: 15 };

/** Tebalkan bagian nama yang cocok dengan kata pencarian. */
function Highlight({ text, q }: { text: string; q: string }): ReactNode {
  const words = q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  const parts = text.split(new RegExp(`(${words.join("|")})`, "ig"));
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}

/**
 * Panel pencarian ala Google Maps: saran SPBU/Pertamini dan nama tempat saat mengetik,
 * riwayat pencarian, dan pintasan. Layar penuh di HP, kartu di bawah kolom cari di desktop.
 */
export function SearchPanel() {
  const t = useTranslations("search");
  const ts = useTranslations("status");
  const locale = useLocale() as Locale;
  const isDesktop = useIsDesktop();
  const places = useApp((s) => s.places);
  const statuses = useApp((s) => s.statuses);
  const user = useApp((s) => s.user);
  const fuelFilter = useApp((s) => s.fuelFilter);
  const { closePanel, select, setSearchPin, openPanel, setPrefs } = useApp.getState();

  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);
  const [gaz, setGaz] = useState<GazetteerEntry[]>([]);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(getRecent());
    void loadGazetteer().then(setGaz);
    inputRef.current?.focus();
    const pill = document.getElementById("search-pill")?.getBoundingClientRect();
    if (pill) setRect({ left: pill.left, top: pill.top, width: pill.width });
  }, []);

  const stationHits = useMemo(() => {
    if (!dq.trim()) return [];
    const hits = searchStations(places, dq, REGION_NAMES);
    // Skor sama: yang lebih dekat dulu
    if (user) {
      hits.sort((a, b) => b.score - a.score || distanceM(user, a.place) - distanceM(user, b.place));
    }
    return hits;
  }, [places, dq, user]);

  // Nama jalan diturunkan dari alamat SPBU, digabung dengan daftar wilayah/desa
  const allGaz = useMemo(
    () => [
      ...gaz,
      ...deriveStreets(places),
      ...places
        .filter((p) => p.kind === "terminal")
        .map((p) => ({ name: p.name, type: "terminal" as const, lat: p.lat, lng: p.lng, sub: p.address ?? undefined })),
    ],
    [gaz, places],
  );
  const placeHits = useMemo(() => (dq.trim() ? searchGazetteer(allGaz, dq, 5) : []), [allGaz, dq]);

  // "SPBU dekat <tempat>": bila teks tidak banyak cocok di alamat, tampilkan yang terdekat dari tempat teratas
  const nearHits = useMemo(() => {
    const top = placeHits[0];
    if (!top || stationHits.length >= 5) return [];
    const taken = new Set(stationHits.map((h) => h.place.id));
    return places
      .filter((p) => p.kind !== "terminal" && !taken.has(p.id))
      .map((p) => ({ p, d: distanceM(top, p) }))
      .filter((x) => x.d <= (top.type === "street" ? 1500 : top.type === "region" ? 6000 : 3500))
      .sort((x, y) => x.d - y.d)
      .slice(0, 5)
      .map((x) => x.p);
  }, [placeHits, stationHits, places]);

  const rows: Row[] = useMemo(() => {
    if (!q.trim()) return recent.map((item, i) => ({ key: `r${i}`, type: "recent" as const, item }));
    return [
      ...stationHits.slice(0, 7).map((h) => ({ key: `s${h.place.id}`, type: "station" as const, place: h.place })),
      ...nearHits.map((p) => ({ key: `n${p.id}`, type: "station" as const, place: p, near: true })),
      ...placeHits.map((entry, i) => ({ key: `p${i}`, type: "place" as const, entry })),
    ];
  }, [q, recent, stationHits, nearHits, placeHits]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const goPlace = (e: { name: string; lat: number; lng: number }, zoom: number) => {
    setSearchPin({ lat: e.lat, lng: e.lng, name: e.name });
    select(null);
    closePanel();
    mapApi.current?.flyTo({ center: [e.lng, e.lat], zoom, duration: 900 });
  };
  const goStation = (p: Place) => {
    setSearchPin(null);
    closePanel();
    select(p.id, { fly: true, open: !window.matchMedia("(min-width: 1024px)").matches });
  };

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.type === "station") {
      saveRecent({ kind: "station", label: row.place.name, id: row.place.id });
      goStation(row.place);
    } else if (row.type === "place") {
      const zoom = ZOOM[row.entry.type];
      saveRecent({ kind: "place", label: row.entry.name, lat: row.entry.lat, lng: row.entry.lng, zoom });
      goPlace(row.entry, zoom);
    } else if (row.item.kind === "station") {
      const p = useApp.getState().placeById.get(row.item.id);
      if (p) goStation(p);
      else setQ(row.item.label);
    } else if (row.item.kind === "place") {
      goPlace({ name: row.item.label, lat: row.item.lat, lng: row.item.lng }, row.item.zoom);
    } else setQ(row.item.label);
  };

  const seeAll = () => {
    if (q.trim()) saveRecent({ kind: "query", label: q.trim() });
    useApp.setState({ listQuery: q.trim() });
    openPanel("list");
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows.length) choose(rows[active]);
      else if (q.trim()) seeAll();
    } else if (e.key === "Escape") closePanel();
  };

  const chip = (label: string, icon: IconName, onClick: () => void) => (
    <button key={label} type="button" className="chip" onClick={onClick}>
      <Icon name={icon} size={16} /> {label}
    </button>
  );

  const stationRow = (p: Place, idx: number) => {
    const e = effectiveStatus(statuses.get(p.id), fuelFilter);
    const age = ageMinutes(e.lastReportAt);
    const sub = [
      p.kind === "spbu" ? null : p.kind === "pertashop" ? "Pertashop" : "Pertamini",
      p.address,
      user ? formatDistance(distanceM(user, p), locale) : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <div
        key={`s${p.id}`}
        id={`sr-${idx}`}
        data-idx={idx}
        role="option"
        aria-selected={active === idx}
        className={`sr-row${active === idx ? " active" : ""}`}
        onMouseEnter={() => setActive(idx)}
        onClick={() => choose({ key: "", type: "station", place: p })}
      >
        <StatusGlyph status={e.status} size={24} confirmed={e.confirmed} />
        <div className="sr-text">
          <div className="sr-title">
            <Highlight text={p.name} q={q} />
          </div>
          <div className="sr-sub">{sub}</div>
          <div className="sr-sub">
            {ts(e.status)}
            {age != null && e.lastReportAt ? ` · ${formatRelative(e.lastReportAt, locale)}` : ""}
          </div>
        </div>
      </div>
    );
  };

  const typeLabel = (e: GazetteerEntry) => t(`type_${e.type}` as "type_town");

  const body = (
    <div ref={listRef} className="sr-body" role="listbox" aria-label={t("placeholder")}>
      {!q.trim() && (
        <>
          <div className="sr-chips">
            {chip(t("sAvailable"), "check", () => {
              setPrefs({ onlyAvailable: true });
              openPanel("list");
            })}
            {chip(t("sPertamini"), "search", () => setQ("pertamini"))}
            {chip(t("sPertashop"), "search", () => setQ("pertashop"))}
          </div>
          {recent.length > 0 && (
            <>
              <div className="sr-head">
                <span>{t("recent")}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    clearRecent();
                    setRecent([]);
                  }}
                >
                  {t("clearRecent")}
                </button>
              </div>
              {recent.map((item, i) => (
                <div
                  key={`r${i}`}
                  id={`sr-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={active === i}
                  className={`sr-row${active === i ? " active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose({ key: "", type: "recent", item })}
                >
                  <span className="sr-ico">
                    <Icon name={item.kind === "place" ? "pin" : "history"} size={18} />
                  </span>
                  <div className="sr-text">
                    <div className="sr-title">{item.label}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-icon btn-ghost"
                    style={{ width: 36, minHeight: 36 }}
                    aria-label={t("removeRecent")}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      removeRecent(item);
                      setRecent(getRecent());
                    }}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
            </>
          )}
          <div className="sr-head">
            <span>{t("regions")}</span>
          </div>
          <div className="sr-chips">
            {gaz
              .filter((g) => g.type === "region")
              .map((g) => (
                <button key={g.name} type="button" className="chip" onClick={() => goPlace(g, ZOOM.region)}>
                  <Icon name="pin" size={16} /> {g.name}
                </button>
              ))}
          </div>
        </>
      )}

      {q.trim() && (
        <>
          {rows.map((r, idx) => {
            const prev = rows[idx - 1];
            const section = r.type === "station" ? (r.near ? "near" : "station") : "place";
            const prevSection = prev ? (prev.type === "station" ? (prev.near ? "near" : "station") : "place") : null;
            const head =
              section !== prevSection ? (
                <div className="sr-head" key={`h${section}`}>
                  <span>
                    {section === "station" ? t("stations") : section === "near" ? t("nearPlace", { name: placeHits[0]?.name ?? "" }) : t("places")}
                  </span>
                </div>
              ) : null;
            if (r.type === "station") {
              return (
                <div key={r.key}>
                  {head}
                  {stationRow(r.place, idx)}
                  {!r.near && idx === 6 && stationHits.length > 7 && (
                    <button type="button" className="sr-more" onClick={seeAll}>
                      {t("seeAll", { n: stationHits.length })}
                    </button>
                  )}
                </div>
              );
            }
            if (r.type !== "place") return null;
            return (
              <div key={r.key}>
                {head}
                <div
                  id={`sr-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={active === idx}
                  className={`sr-row${active === idx ? " active" : ""}`}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(r)}
                >
                  <span className="sr-ico">
                    <Icon name="pin" size={18} />
                  </span>
                  <div className="sr-text">
                    <div className="sr-title">
                      <Highlight text={r.entry.name} q={q} />
                    </div>
                    <div className="sr-sub">{[typeLabel(r.entry), r.entry.sub].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {!rows.length && q === dq && (
            <div className="sr-empty">
              <p>{t("none", { q: q.trim() })}</p>
              <p className="caption muted">{t("noneHint")}</p>
            </div>
          )}
        </>
      )}
    </div>
  );

  const bar = (
    <div className="sr-bar">
      <button type="button" className="btn btn-icon btn-ghost" aria-label={t("close")} onClick={closePanel}>
        <Icon name="back" size={20} />
      </button>
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={q}
        placeholder={t("placeholder")}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded
        aria-controls="sr-list"
        aria-activedescendant={rows.length ? `sr-${active}` : undefined}
        aria-label={t("placeholder")}
      />
      {q && (
        <button type="button" className="btn btn-icon btn-ghost" aria-label={t("clear")} onClick={() => { setQ(""); inputRef.current?.focus(); }}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="scrim" style={{ background: isDesktop ? "transparent" : "rgb(10 45 42 / 0.25)" }} onClick={closePanel} aria-hidden="true" />
      <div
        className="search-panel"
        role="dialog"
        aria-label={t("placeholder")}
        style={isDesktop && rect ? { left: rect.left, top: rect.top, width: Math.max(rect.width, 420) } : undefined}
      >
        {bar}
        <div id="sr-list">{body}</div>
      </div>
    </>
  );
}
