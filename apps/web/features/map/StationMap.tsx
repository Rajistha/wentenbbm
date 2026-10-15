"use client";
import { BALI_BOUNDS, DENPASAR, effectiveStatus, formatDistance, distanceM, freshness, ageMinutes, type Locale } from "@wenten/core";
import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LIGHT_STYLE } from "@/lib/map-style";
import { MAP_STYLE_URL } from "@/lib/env";
import { useApp } from "@/lib/store";
import { useIsDesktop, useReducedMotion } from "../common/useMedia";
import { StationPopup } from "../stations/StationPopup";
import { useVisiblePlaces } from "../stations/selectors";
import { addMarkerImages } from "./icons";
import { mapApi } from "./mapApi";

const styleFor = () => MAP_STYLE_URL || LIGHT_STYLE;

const RANK = { available: 0, limited: 1, empty: 2, unknown: 3 } as const;

export function StationMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [popupNode, setPopupNode] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(0);
  const isDesktop = useIsDesktop();
  const reduced = useReducedMotion();
  const t = useTranslations();
  const locale = useLocale() as Locale;

  const visible = useVisiblePlaces();
  const statuses = useApp((s) => s.statuses);
  const fuelFilter = useApp((s) => s.fuelFilter);
  const selectedId = useApp((s) => s.selectedId);
  const flyToken = useApp((s) => s.flyToken);
  const user = useApp((s) => s.user);
  const panel = useApp((s) => s.panel);
  const geoState = useApp((s) => s.geoState);

  const desktopRef = useRef(isDesktop);
  desktopRef.current = isDesktop;

  // ── Inisialisasi peta ──
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: styleFor(),
      bounds: BALI_BOUNDS,
      fitBoundsOptions: {
        padding:
          window.innerWidth < 1024 ? { top: 200, bottom: 230, left: 8, right: 8 } : { top: 20, bottom: 20, left: 20, right: 20 },
      },
      maxBounds: [
        [113.6, -9.4],
        [116.6, -7.4],
      ],
      attributionControl: { compact: false },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;

    const onStyle = async () => {
      await addMarkerImages(map);
      if (!map.getSource("stations")) {
        map.addSource("stations", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getSource("pin")) {
        map.addSource("pin", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      if (!map.getSource("user")) {
        map.addSource("user", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      }
      const accent = "#2563eb";
      const text = "#0f172a";
      const surface = "#ffffff";

      map.addLayer({
        id: "user-accuracy",
        type: "circle",
        source: "user",
        paint: {
          "circle-color": accent,
          "circle-opacity": 0.12,
          "circle-stroke-color": accent,
          "circle-stroke-opacity": 0.35,
          "circle-stroke-width": 1,
          "circle-radius": 0,
        },
      });
      map.addLayer({
        id: "stations",
        type: "symbol",
        source: "stations",
        layout: {
          "icon-image": ["get", "icon"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 8, ["case", ["get", "sel"], 1, 0.55], 11, ["case", ["get", "sel"], 1.3, 0.85], 14, ["case", ["get", "sel"], 1.6, 1.2]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          // Tersedia digambar paling atas (DESIGN.md 3, urutan tumpukan)
          "symbol-sort-key": ["get", "sort"],
        },
        paint: {
          "icon-opacity": ["case", ["get", "stale"], 0.55, 1],
        },
      });
      map.addLayer({
        id: "terminal-labels",
        type: "symbol",
        source: "stations",
        filter: ["==", ["get", "kind"], "terminal"],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#334155", "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });
      map.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        filter: [">=", ["zoom"], 13],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
          "text-max-width": 10,
          "text-optional": true,
        },
        paint: { "text-color": text, "text-halo-color": surface, "text-halo-width": 1.5 },
      });
      map.addLayer({
        id: "pin-halo",
        type: "circle",
        source: "pin",
        paint: { "circle-radius": 16, "circle-color": "#2563eb", "circle-opacity": 0.18 },
      });
      map.addLayer({
        id: "pin-dot",
        type: "circle",
        source: "pin",
        paint: { "circle-radius": 7, "circle-color": "#2563eb", "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 },
      });
      map.addLayer({
        id: "pin-label",
        type: "symbol",
        source: "pin",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-offset": [0, 1.6],
          "text-anchor": "top",
          "text-max-width": 9,
        },
        paint: { "text-color": "#0f172a", "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });
      map.addLayer({
        id: "user-dot",
        type: "circle",
        source: "user",
        paint: {
          "circle-radius": 7,
          "circle-color": accent,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });
      setReady((n) => n + 1);
    };
    map.on("style.load", onStyle);

    map.on("click", "stations", (e) => {
      const props = e.features?.[0]?.properties;
      const id = props?.id as string | undefined;
      if (!id) return;
      if (props?.kind === "terminal") {
        const idLang = document.documentElement.lang !== "en";
        const el = document.createElement("div");
        el.className = "popup-inner";
        const h = document.createElement("strong");
        h.textContent = String(props.name);
        const p1 = document.createElement("div");
        p1.className = "caption muted";
        p1.textContent = String(props.info || "");
        const p2 = document.createElement("div");
        p2.className = "caption";
        p2.textContent = idLang
          ? "Terminal distribusi BBM Pertamina. Titik referensi, bukan SPBU: tidak melayani pembelian dan tidak bisa dilaporkan."
          : "Pertamina fuel distribution terminal. A reference point, not a station: no retail sales and not reportable.";
        el.append(h, p1, p2);
        new maplibregl.Popup({ className: "station-popup", closeButton: true, maxWidth: "340px", offset: 18 })
          .setLngLat(e.lngLat)
          .setDOMContent(el)
          .addTo(map);
        return;
      }
      useApp.getState().select(id, { open: !desktopRef.current });
    });
    map.on("click", (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ["stations"] });
      if (!hit.length && useApp.getState().selectedId && useApp.getState().panel !== "report") {
        useApp.getState().select(null);
      }
      if (!hit.length && useApp.getState().searchPin) useApp.getState().setSearchPin(null);
    });
    for (const layer of ["stations"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Terminal BBM (titik referensi, tidak bisa dilaporkan) ──
  const allPlaces = useApp((s) => s.places);
  const showTerminals = useApp((s) => s.showTerminals);
  const terminalFeatures = useMemo(
    () =>
      showTerminals
        ? allPlaces
            .filter((p) => p.kind === "terminal")
            .map((p) => ({
              type: "Feature" as const,
              id: p.id,
              geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
              properties: { id: p.id, name: p.name, kind: "terminal", status: "unknown", icon: "tbbm", stale: false, sel: false, sort: 4, info: p.address ?? "" },
            }))
        : [],
    [allPlaces, showTerminals],
  );

  // ── Data penanda ──
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("stations") as GeoJSONSource | undefined;
    if (!map || !src) return;
    const now = Date.now();
    src.setData({
      type: "FeatureCollection",
      features: [...terminalFeatures, ...visible.map((p) => {
        const e = effectiveStatus(statuses.get(p.id), fuelFilter);
        const fr = freshness(ageMinutes(e.lastReportAt, now));
        const prefix = p.kind === "spbu" ? "st" : "rt";
        return {
          type: "Feature",
          id: p.id,
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: {
            id: p.id,
            name: p.name,
            status: e.status,
            icon: `${prefix}-${e.status}${e.confirmed && p.kind === "spbu" ? "-c" : ""}`,
            stale: fr === "stale",
            sel: p.id === selectedId,
            sort: (p.id === selectedId ? 10 : 0) + 3 - RANK[e.status],
          },
        };
      })],
    });
  }, [visible, statuses, fuelFilter, selectedId, ready, terminalFeatures]);

  // ── Penanda hasil pencarian tempat ──
  const searchPin = useApp((s) => s.searchPin);
  useEffect(() => {
    const src = mapRef.current?.getSource("pin") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: searchPin
        ? [{ type: "Feature", geometry: { type: "Point", coordinates: [searchPin.lng, searchPin.lat] }, properties: { name: searchPin.name } }]
        : [],
    });
  }, [searchPin, ready]);

  // ── Lokasi pengguna ──
  const centeredOnUser = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("user") as GeoJSONSource | undefined;
    if (!map || !src) return;
    if (!user) {
      src.setData({ type: "FeatureCollection", features: [] });
      return;
    }
    src.setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [user.lng, user.lat] }, properties: {} }],
    });
    // Lingkaran akurasi dalam meter: konversi ke piksel per zoom
    const r0 = user.accuracy / (156543.03 * Math.cos((user.lat * Math.PI) / 180));
    map.setPaintProperty("user-accuracy", "circle-radius", ["interpolate", ["exponential", 2], ["zoom"], 0, r0, 22, r0 * 2 ** 22]);
    // US-01: pertama kali lokasi didapat, tampilkan radius sekitar 5 km
    if (!centeredOnUser.current && !useApp.getState().selectedId) {
      centeredOnUser.current = true;
      map.flyTo({ center: [user.lng, user.lat], zoom: 12.6, animate: !reduced });
    }
  }, [user, ready, reduced]);

  // US-01: lokasi ditolak, pusatkan di Denpasar
  useEffect(() => {
    if (geoState === "denied" && !useApp.getState().selectedId) {
      mapRef.current?.flyTo({ center: [DENPASAR.lng, DENPASAR.lat], zoom: 12, animate: !reduced });
    }
  }, [geoState, reduced]);

  // ── Terbang ke SPBU terpilih ──
  useEffect(() => {
    const map = mapRef.current;
    const id = useApp.getState().selectedId;
    const place = id ? useApp.getState().placeById.get(id) : null;
    if (!map || !place || !flyToken) return;
    const sheetOffset = desktopRef.current ? 0 : -Math.round(window.innerHeight * 0.25);
    map.flyTo({
      center: [place.lng, place.lat],
      zoom: Math.max(map.getZoom(), 14),
      offset: desktopRef.current ? [panel === "detail" || panel === "list" ? -200 : 0, 80] : [0, sheetOffset],
      animate: !reduced,
      duration: 900,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToken, ready]);

  // ── Popup desktop ──
  useEffect(() => {
    const map = mapRef.current;
    const place = selectedId ? useApp.getState().placeById.get(selectedId) : null;
    popupRef.current?.remove();
    popupRef.current = null;
    setPopupNode(null);
    if (!map || !place || !isDesktop || panel === "detail" || panel === "report") return;
    const node = document.createElement("div");
    const popup = new maplibregl.Popup({
      className: "station-popup",
      closeButton: false,
      closeOnClick: false,
      maxWidth: "380px",
      offset: 18,
      focusAfterOpen: false,
    })
      .setLngLat([place.lng, place.lat])
      .setDOMContent(node)
      .addTo(map);
    popupRef.current = popup;
    setPopupNode(node);
    return () => {
      popup.remove();
    };
  }, [selectedId, isDesktop, panel]);

  // Expose map untuk tombol zoom dan "Lokasi saya"
  useEffect(() => {
    mapApi.current = mapRef.current;
  }, [ready]);

  const sel = selectedId ? useApp.getState().placeById.get(selectedId) : null;
  const label = sel
    ? `${sel.name}, ${t(`status.${effectiveStatus(statuses.get(sel.id), fuelFilter).status}`)}${
        user ? `, ${formatDistance(distanceM(user, sel), locale)}` : ""
      }`
    : t("meta.tagline");

  return (
    <>
      <div ref={container} className="map-canvas" role="region" aria-label={label} />
      {popupNode && selectedId && createPortal(<StationPopup id={selectedId} />, popupNode)}
    </>
  );
}

