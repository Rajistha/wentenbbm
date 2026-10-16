import { describe, expect, it } from "vitest";
import { projectBali, summarizeFuel } from "./summary";
import type { Place, StationStatus } from "./types";

const place = (id: string, regionId: number, kind: Place["kind"] = "spbu"): Place => ({
  id, slug: id, kind, brand: "pertamina", code: null, name: id, lat: -8.6, lng: 115.2, regionId, is24h: false, fuelIds: [1], address: null,
});
const st = (id: string, overall: StationStatus["overall"]): StationStatus => ({
  id, overall, confirmed: false, queue: null, waitLow: null, waitHigh: null, lastReportAt: null, fuels: [],
});

describe("summarizeFuel", () => {
  it("menghitung status, mengabaikan pengecer, dan mengurutkan wilayah menurut jumlah SPBU", () => {
    const places = [place("a", 1), place("b", 1), place("c", 3), place("d", 1), place("p", 3, "retailer")];
    const s = summarizeFuel(
      places,
      new Map([["a", st("a", "available")], ["b", st("b", "limited")], ["c", st("c", "empty")]]),
    );
    expect(s).toMatchObject({ total: 4, available: 1, limited: 1, empty: 1, unknown: 1, withFuel: 2, reported: 3 });
    expect(s.areas.map((a) => [a.name, a.total])).toEqual([["Denpasar", 3], ["Gianyar", 1]]);
  });
  it("tanpa laporan: semua belum ada kabar", () => {
    const s = summarizeFuel([place("a", 1)], new Map());
    expect(s).toMatchObject({ total: 1, unknown: 1, reported: 0, withFuel: 0 });
  });
});

describe("projectBali", () => {
  it("menaruh titik di dalam bingkai 0..1 dengan utara di atas", () => {
    const north = projectBali(-8.1, 115);
    const south = projectBali(-8.85, 115);
    expect(north.y).toBeLessThan(south.y);
    for (const p of [north, south]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(1);
    }
  });
});
