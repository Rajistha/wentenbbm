import { describe, expect, it } from "vitest";
import { bestBets, regionNeeds } from "./rank";
import type { Place, StationStatus } from "./types";

const NOW = Date.UTC(2026, 9, 16, 4, 0, 0);
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const place = (id: string, lat: number, regionId = 1, kind: Place["kind"] = "spbu"): Place => ({
  id, slug: id, kind, brand: "pertamina", code: null, name: id, lat, lng: 115.2, regionId, is24h: false, fuelIds: [1], address: null,
});
const status = (id: string, overall: StationStatus["overall"], p: Partial<StationStatus> = {}): StationStatus => ({
  id, overall, confirmed: false, queue: null, waitLow: null, waitHigh: null, lastReportAt: ago(5), fuels: [], ...p,
});

describe("bestBets", () => {
  const from = { lat: -8.65, lng: 115.2 };
  it("hanya Tersedia/Terbatas, yang dekat dan segar lebih dulu", () => {
    const places = [place("dekat", -8.651), place("jauh", -8.7), place("habis", -8.652), place("kosong", -8.653)];
    const st = new Map<string, StationStatus>([
      ["dekat", status("dekat", "available")],
      ["jauh", status("jauh", "available")],
      ["habis", status("habis", "empty")],
    ]);
    const r = bestBets(places, st, from, "all", 5, NOW);
    expect(r.map((x) => x.place.id)).toEqual(["dekat", "jauh"]);
  });
  it("antrean panjang dan status Terbatas menurunkan peringkat", () => {
    const places = [place("a", -8.651), place("b", -8.655)];
    const st = new Map<string, StationStatus>([
      ["a", status("a", "available", { queue: "long" })],
      ["b", status("b", "available", { queue: "none" })],
    ]);
    expect(bestBets(places, st, from, "all", 5, NOW)[0]!.place.id).toBe("b");
  });
  it("tanpa lokasi tetap mengembalikan hasil", () => {
    const st = new Map([["a", status("a", "available")]]);
    expect(bestBets([place("a", -8.65)], st, null, "all", 5, NOW)).toHaveLength(1);
  });
});

describe("regionNeeds", () => {
  it("menghitung SPBU tanpa kabar segar per wilayah, mengabaikan pengecer", () => {
    const places = [
      place("a", -8.65, 1), place("b", -8.66, 1), place("c", -8.4, 3), place("p", -8.4, 3, "retailer"),
    ];
    const st = new Map<string, StationStatus>([
      ["a", status("a", "available", { lastReportAt: ago(10) })],
      ["b", status("b", "available", { lastReportAt: ago(300) })],
    ]);
    const r = regionNeeds(places, st, NOW);
    expect(r).toEqual([
      { regionId: 3, total: 1, stale: 1 },
      { regionId: 1, total: 2, stale: 1 },
    ]);
  });
});
