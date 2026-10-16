import { describe, expect, it } from "vitest";
import {
  distanceM,
  formatDistance,
  formatWita,
  freshness,
  googleMapsDirUrl,
  nearestWithFuel,
  type Place,
  type StationStatus,
} from "./index";

const place = (id: string, lat: number, lng: number): Place => ({
  id,
  slug: id,
  kind: "spbu",
  brand: "pertamina",
  code: null,
  name: id,
  lat,
  lng,
  regionId: 1,
  is24h: true,
  fuelIds: [1, 2],
  address: null,
});

const status = (id: string, overall: StationStatus["overall"]): StationStatus => ({
  id,
  overall,
  confirmed: false,
  queue: null,
  waitLow: null,
  waitHigh: null,
  lastReportAt: new Date().toISOString(),
  fuels: [{ fuelTypeId: 1, status: overall, confirmed: false, lastReportAt: new Date().toISOString() }],
});

describe("format", () => {
  it("jarak dibulatkan sesuai DESIGN.md", () => {
    expect(formatDistance(640)).toBe("650 m");
    expect(formatDistance(1234)).toBe("1,2 km");
    expect(formatDistance(10)).toBe("50 m");
  });
  it("waktu WITA format 24 jam", () => {
    expect(formatWita("2026-10-15T11:02:00Z")).toBe("19.02 WITA");
  });
  it("kesegaran", () => {
    expect(freshness(10)).toBe("new");
    expect(freshness(60)).toBe("normal");
    expect(freshness(100)).toBe("stale");
    expect(freshness(130)).toBe("stale");
    expect(freshness(null)).toBe("expired");
  });
});

describe("geo", () => {
  it("haversine kira-kira benar", () => {
    const d = distanceM({ lat: -8.67, lng: 115.21 }, { lat: -8.68, lng: 115.21 });
    expect(Math.round(d)).toBeGreaterThan(1100);
    expect(Math.round(d)).toBeLessThan(1120);
  });
  it("tautan Google Maps", () => {
    expect(googleMapsDirUrl({ lat: -8.1, lng: 115.2 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-8.1,115.2",
    );
  });
});

describe("nearestWithFuel", () => {
  const from = { lat: -8.67, lng: 115.21 };
  const places = [place("a", -8.68, 115.21), place("b", -8.7, 115.21), place("c", -8.671, 115.21)];
  it("memilih Tersedia terdekat", () => {
    const st = new Map([
      ["a", status("a", "available")],
      ["b", status("b", "available")],
      ["c", status("c", "empty")],
    ]);
    expect(nearestWithFuel(from, places, st, "all")?.place.id).toBe("a");
  });
  it("jatuh ke Terbatas bila tidak ada Tersedia dalam 15 km", () => {
    const st = new Map([["c", status("c", "limited")]]);
    const r = nearestWithFuel(from, places, st, 1);
    expect(r?.place.id).toBe("c");
    expect(r?.fellBackToLimited).toBe(true);
  });
  it("distanceM simetris", () => {
    expect(distanceM(places[0]!, places[1]!)).toBeCloseTo(distanceM(places[1]!, places[0]!));
  });
});
