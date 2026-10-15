"use client";
import type { FuelStatus } from "@wenten/core";
import type { Map as MlMap } from "maplibre-gl";

// Penanda digambar sebagai SVG lalu dimasukkan lewat map.addImage (DESIGN.md 3),
// bukan elemen DOM, agar ratusan titik tetap ringan.

interface Colors {
  available: string;
  limited: string;
  empty: string;
  unknown: string;
  fill: string;
  ring: string;
  surface: string;
  text: string;
}

// Peta selalu memakai basemap terang berwarna, jadi penanda memakai palet tetap (tidak mengikuti tema UI).
export function readColors(): Colors {
  return {
    available: "#16a34a",
    limited: "#f59e0b",
    empty: "#e11d48",
    unknown: "#64748b",
    fill: "#ffffff",
    ring: "#1e3a8a",
    surface: "#ffffff",
    text: "#0f172a",
  };
}

const SIZE = 32; // px CSS, digambar 2x

function svg(body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * 2}" height="${SIZE * 2}" viewBox="-16 -16 32 32">${body}</svg>`;
}

// Ikon pompa SPBU (garis putih) di dalam lingkaran status.
function pump(stroke: string) {
  return (
    `<g fill="none" stroke="${stroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" transform="translate(-0.5 0) scale(0.78)">` +
    `<path d="M-6,8.5 V-7 a2,2 0 0 1 2,-2 h6 a2,2 0 0 1 2,2 V8.5 M-7.5,8.5 H5.5"/>` +
    `<path d="M-4,-4.5 H3"/>` +
    `<path d="M7.5,-2 h1 a1.6,1.6 0 0 1 1.6,1.6 V5 a1.5,1.5 0 0 0 3,0 V-3.5 L10.2,-6"/>` +
    `</g>`
  );
}

function stationSvg(status: FuelStatus, confirmed: boolean, c: Colors) {
  let body = "";
  if (confirmed) body += `<circle r="15" fill="none" stroke="${c.ring}" stroke-width="2"/>`;
  switch (status) {
    case "available":
      body += `<circle r="12" fill="${c.available}" stroke="${c.fill}" stroke-width="2"/>` + pump("#fff");
      break;
    case "limited":
      body +=
        `<circle r="12" fill="${c.limited}" stroke="${c.fill}" stroke-width="2"/>` +
        pump("#fff") +
        `<circle cx="8.5" cy="8.5" r="5" fill="#fff" stroke="${c.limited}" stroke-width="1.5"/><path d="M8.5,4.2 A4.3,4.3 0 0 0 8.5,12.8 Z" fill="${c.limited}"/>`;
      break;
    case "empty":
      body +=
        `<circle r="12" fill="${c.empty}" stroke="${c.fill}" stroke-width="2"/>` +
        pump("#fff") +
        `<circle cx="8.5" cy="8.5" r="5" fill="#fff" stroke="${c.empty}" stroke-width="1.5"/><path d="M6.2,6.2 L10.8,10.8 M10.8,6.2 L6.2,10.8" stroke="${c.empty}" stroke-width="1.8" stroke-linecap="round"/>`;
      break;
    default:
      body += `<circle r="11.5" fill="${c.fill}" stroke="${c.unknown}" stroke-width="2" stroke-dasharray="4 3"/>` + pump(c.unknown);
  }
  return svg(body);
}

// Pertashop / Pertamini: kotak membulat berisi ikon pompa, supaya beda dari SPBU (lingkaran).
function retailSvg(status: FuelStatus, c: Colors) {
  const color = { available: c.available, limited: c.limited, empty: c.empty, unknown: c.unknown }[status];
  if (status === "unknown") {
    return svg(`<rect x="-10" y="-10" width="20" height="20" rx="5" fill="${c.fill}" stroke="${color}" stroke-width="2" stroke-dasharray="4 3"/><g transform="scale(0.72)">${pump(color)}</g>`);
  }
  return svg(`<rect x="-10.5" y="-10.5" width="21" height="21" rx="5" fill="${color}" stroke="${c.fill}" stroke-width="2"/><g transform="scale(0.72)">${pump("#fff")}</g>`);
}

async function add(map: MlMap, name: string, markup: string) {
  const img = new Image(SIZE * 2, SIZE * 2);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await img.decode();
  if (map.hasImage(name)) map.removeImage(name);
  map.addImage(name, img, { pixelRatio: 2 });
}

// Terminal BBM: belah ketupat gelap berisi tangki, beda dari penanda SPBU.
function terminalSvg() {
  return svg(
    `<path d="M0,-14 L14,0 L0,14 L-14,0 Z" fill="#334155" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>` +
      `<rect x="-5" y="-3" width="10" height="8" rx="1.5" fill="#ffffff"/><ellipse cx="0" cy="-3" rx="5" ry="2" fill="#ffffff" stroke="#334155" stroke-width="1"/>`,
  );
}

const STATUSES: FuelStatus[] = ["available", "limited", "empty", "unknown"];

export async function addMarkerImages(map: MlMap) {
  const c = readColors();
  const jobs: Promise<void>[] = [];
  for (const s of STATUSES) {
    jobs.push(add(map, `st-${s}`, stationSvg(s, false, c)));
    jobs.push(add(map, `st-${s}-c`, stationSvg(s, true, c)));
    jobs.push(add(map, `rt-${s}`, retailSvg(s, c)));
  }
  jobs.push(add(map, "tbbm", terminalSvg()));
  await Promise.all(jobs);
  return c;
}
