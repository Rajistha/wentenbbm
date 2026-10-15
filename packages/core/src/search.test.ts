import { describe, expect, it } from "vitest";
import { deriveStreets, expandQuery, normalize, searchGazetteer, searchStations, type GazetteerEntry, type Place } from "./index";

const p = (id: string, name: string, kind: Place["kind"], extra: Partial<Place> = {}): Place => ({
  id,
  slug: id,
  kind,
  brand: "pertamina",
  code: null,
  name,
  lat: -8.6,
  lng: 115.2,
  regionId: 1,
  is24h: false,
  fuelIds: [1],
  address: null,
  ...extra,
});

const places = [
  p("a", "SPBU Dauh Puri Kaja", "spbu", { code: "54.801.35", address: "Jalan Gatot Subroto, Dauh Puri Kaja" }),
  p("b", "SPBU Kapal", "spbu", { regionId: 2, address: "Jalan Raya Kapal, Mengwi" }),
  p("c", "Pengecer Pertamini 3", "retailer"),
  p("d", "Pertashop Telagatawang", "pertashop"),
];
const regions = { 1: "Kota Denpasar", 2: "Badung" };

describe("normalize", () => {
  it("menyederhanakan teks", () => {
    expect(normalize("  Jalan-Raya, KAPAL! ")).toBe("jalan raya kapal");
  });
});

describe("searchStations", () => {
  it("mencari awalan kata dan multi kata", () => {
    expect(searchStations(places, "dauh pur", regions)[0]?.place.id).toBe("a");
    expect(searchStations(places, "kapal mengwi", regions)[0]?.place.id).toBe("b");
  });
  it("toleransi salah ketik satu huruf", () => {
    expect(searchStations(places, "kapel", regions).map((h) => h.place.id)).toContain("b");
  });
  it("mencari lewat nomor SPBU", () => {
    expect(searchStations(places, "54.801", regions)[0]?.place.id).toBe("a");
  });
  it("kata jenis menyaring Pertamini dan Pertashop", () => {
    expect(searchStations(places, "pertamini", regions).map((h) => h.place.id)).toEqual(["c"]);
    expect(searchStations(places, "pertashop", regions).map((h) => h.place.id)).toEqual(["d"]);
    expect(searchStations(places, "spbu", regions).map((h) => h.place.id).sort()).toEqual(["a", "b"]);
  });
  it("mencari lewat nama wilayah", () => {
    expect(searchStations(places, "badung", regions).map((h) => h.place.id)).toEqual(["b"]);
  });
  it("tidak ada hasil bila tidak cocok", () => {
    expect(searchStations(places, "zzzzqq", regions)).toEqual([]);
  });
});

describe("searchGazetteer", () => {
  const g: GazetteerEntry[] = [
    { name: "Kuta", type: "town", lat: -8.72, lng: 115.17 },
    { name: "Pekutatan", type: "village", lat: -8.4, lng: 114.7 },
    { name: "Ubud", type: "town", lat: -8.5, lng: 115.26 },
  ];
  it("awalan nama lebih dulu dari substring kata", () => {
    expect(searchGazetteer(g, "kut")[0]?.name).toBe("Kuta");
    expect(searchGazetteer(g, "ubd").length).toBe(0);
    expect(searchGazetteer(g, "ubud")[0]?.name).toBe("Ubud");
  });
});

describe("singkatan lokal dan jalan", () => {
  const withStreet = [
    ...places,
    p("e", "SPBU Dauh Puri Kaja 2", "spbu", { address: "Jalan Bypass Gatot Subroto, Dauh Puri Kaja" }),
    p("f", "SPBU Pesanggaran", "spbu", { address: "Jalan By Pass Ngurah Rai, Pesanggaran", lat: -8.7 }),
  ];
  it("memperluas singkatan", () => {
    expect(expandQuery("Jl Gatsu")).toBe("jalan gatot subroto");
    expect(expandQuery("by pass")).toBe("bypass");
  });
  it("gatsu menemukan SPBU di Jalan Gatot Subroto", () => {
    const ids = searchStations(withStreet, "gatsu", regions).map((h) => h.place.id);
    expect(ids).toContain("e");
    expect(ids).toContain("a");
  });
  it("menurunkan jalan dari alamat dan mencarinya", () => {
    const streets = deriveStreets(withStreet);
    expect(streets.some((s) => s.name === "Jalan Bypass Gatot Subroto")).toBe(true);
    expect(searchGazetteer(streets, "gatsu")[0]?.type).toBe("street");
    expect(searchGazetteer(streets, "bypass ngurah rai")[0]?.name).toBe("Jalan By Pass Ngurah Rai");
  });
});
