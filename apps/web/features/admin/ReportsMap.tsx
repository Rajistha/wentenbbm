"use client";
import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { MAP_STYLE_URL } from "@/lib/env";
import { LIGHT_STYLE } from "@/lib/map-style";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const COLORS = { active: "#2563eb", quarantined: "#f59e0b", hidden: "#64748b" } as const;
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const wita = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Peta lokasi pelapor untuk admin: titik berwarna menurut status laporan (biru aktif, kuning dikarantina, abu-abu
 * disembunyikan), garis putus-putus ke SPBU-nya, dan cincin kecil di SPBU. Ketuk titik untuk rincian.
 */
export function ReportsMap({ rows }: { rows: Row[] }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const draw = () => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    const data = rowsRef.current.filter((r) => r.lat != null && r.lng != null);
    const points = {
      type: "FeatureCollection" as const,
      features: data.map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
        properties: { id: r.id, color: COLORS[r.moderation_status as keyof typeof COLORS] ?? COLORS.hidden, html: popupHtml(r) },
      })),
    };
    const lines = {
      type: "FeatureCollection" as const,
      features: data.map((r) => ({
        type: "Feature" as const,
        geometry: { type: "LineString" as const, coordinates: [[r.lng, r.lat], [r.station_lng, r.station_lat]] },
        properties: {},
      })),
    };
    const stations = {
      type: "FeatureCollection" as const,
      features: data.map((r) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [r.station_lng, r.station_lat] }, properties: {} })),
    };
    (map.getSource("lines") as GeoJSONSource).setData(lines);
    (map.getSource("stations") as GeoJSONSource).setData(stations);
    (map.getSource("points") as GeoJSONSource).setData(points);
    if (data.length) {
      const b = new maplibregl.LngLatBounds();
      for (const r of data) {
        b.extend([r.lng, r.lat]);
        b.extend([r.station_lng, r.station_lat]);
      }
      map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 0 });
    }
  };

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: MAP_STYLE_URL || LIGHT_STYLE,
      center: [115.19, -8.5],
      zoom: 8.3,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      const empty = { type: "FeatureCollection" as const, features: [] };
      map.addSource("lines", { type: "geojson", data: empty });
      map.addSource("stations", { type: "geojson", data: empty });
      map.addSource("points", { type: "geojson", data: empty });
      map.addLayer({ id: "lines", type: "line", source: "lines", paint: { "line-color": "#475569", "line-width": 1.5, "line-dasharray": [2, 2], "line-opacity": 0.8 } });
      map.addLayer({ id: "stations", type: "circle", source: "stations", paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#0f172a", "circle-stroke-width": 2 } });
      map.addLayer({ id: "points", type: "circle", source: "points", paint: { "circle-radius": 7, "circle-color": ["get", "color"], "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      map.on("click", "points", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        new maplibregl.Popup({ maxWidth: "300px", offset: 10 })
          .setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates)
          .setHTML(String(f.properties?.html ?? ""))
          .addTo(map);
      });
      map.on("mouseenter", "points", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "points", () => (map.getCanvas().style.cursor = ""));
      loaded.current = true;
      map.resize();
      draw();
    });
    // Ukuran kotak baru final setelah tata letak; sesuaikan kanvas dan bingkai ulang titiknya
    const ro = new ResizeObserver(() => {
      map.resize();
      draw();
    });
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      loaded.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(draw, [rows]);

  return <div ref={el} className="adm-map" role="img" aria-label="Peta lokasi pelapor" />;
}

function popupHtml(r: Row) {
  const dist = r.distance_m >= 1000 ? `${(r.distance_m / 1000).toFixed(1)} km` : `${r.distance_m} m`;
  return `<div style="font:13px/1.45 system-ui,sans-serif;color:#0f172a">
    <strong>${esc(r.station_name)}</strong><br/>
    ${esc(wita(r.created_at))} · ${esc(r.moderation_status)}<br/>
    ${esc(r.pseudonym)}${r.ip_key ? ` · IP #${esc(r.ip_key)}` : ""}<br/>
    ${esc(dist)} dari SPBU · akurasi ±${esc(r.accuracy_m)} m<br/>
    <a href="https://www.google.com/maps/search/?api=1&query=${esc(r.lat)},${esc(r.lng)}" target="_blank" rel="noopener noreferrer">Buka di Google Maps</a>
  </div>`;
}
