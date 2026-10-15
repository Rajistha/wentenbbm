import { describe, expect, it } from "vitest";
import { googleMapsDirToPlaceUrl, stationSearchQuery, type Place } from "./index";

const base: Place = {
  id: "1",
  slug: "x",
  kind: "spbu",
  brand: "pertamina",
  code: null,
  name: "SPBU Dauh Puri Kaja 2",
  lat: -8.65,
  lng: 115.21,
  regionId: 1,
  is24h: false,
  fuelIds: [1],
  address: "Jalan Bypass Gatot Subroto, Dauh Puri Kaja",
};

describe("pencarian tujuan Google Maps", () => {
  it("menyusun nama, jalan, kelurahan, kabupaten tanpa mengulang kata", () => {
    const q = stationSearchQuery(base);
    expect(q).toBe("SPBU Pertamina Dauh Puri Kaja Jalan Bypass Gatot Subroto Kota Denpasar Bali");
    expect(q.match(/Kaja/g)?.length).toBe(1);
  });
  it("memakai nomor SPBU bila ada", () => {
    expect(stationSearchQuery({ ...base, code: "54.801.35" })).toContain("SPBU Pertamina 54.801.35");
  });
  it("alamat 'Dekat X' dipakai sebagai kelurahan", () => {
    expect(stationSearchQuery({ ...base, name: "SPBU Kapal", address: "Dekat Kapal", regionId: 2 })).toBe("SPBU Pertamina Kapal Badung Bali");
  });
  it("Pertamini dan Pertashop memakai awalan sendiri", () => {
    expect(stationSearchQuery({ ...base, kind: "retailer", name: "Pengecer Pertamini 3", address: "Dekat Sanur Kauh" })).toMatch(/^Pertamini /);
    expect(stationSearchQuery({ ...base, kind: "pertashop", name: "Pertashop Telagatawang", address: null })).toMatch(/^Pertashop /);
  });
  it("URL rute: tujuan teks, asal kosong, dibiaskan ke koordinat", () => {
    const u = googleMapsDirToPlaceUrl(base);
    expect(u.startsWith("https://www.google.com/maps/dir//")).toBe(true);
    expect(u.endsWith("/@-8.65,115.21,17z")).toBe(true);
    expect(u).toContain("SPBU%20Pertamina");
  });
});
