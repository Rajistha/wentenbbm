import { describe, expect, it } from "vitest";
import { angleDiff, bearingDeg, pickFacingImage, type StreetImage } from "./index";

const station = { lat: -8.65, lng: 115.2 };
// ~30 m di selatan SPBU, kamera menghadap utara
const south = { lat: station.lat - 0.00027, lng: station.lng };

const img = (id: string, p: { lat: number; lng: number }, heading: number | null, extra: Partial<StreetImage> = {}): StreetImage => ({
  id,
  url: `https://x/${id}.jpg`,
  lat: p.lat,
  lng: p.lng,
  heading,
  capturedAt: Date.now() - 365 * 24 * 3600_000,
  author: "u",
  ...extra,
});

describe("arah", () => {
  it("bearing ke utara dan timur", () => {
    expect(Math.round(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }))).toBe(0);
    expect(Math.round(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }))).toBe(90);
  });
  it("selisih sudut melingkar", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(0, 180)).toBe(180);
  });
});

describe("pickFacingImage", () => {
  it("memilih foto yang menghadap SPBU", () => {
    const facing = img("facing", south, 0);
    const away = img("away", south, 180);
    expect(pickFacingImage([away, facing], station)?.id).toBe("facing");
  });
  it("melewati panorama, tanpa arah, terlalu jauh, dan terlalu dekat", () => {
    const far = { lat: station.lat - 0.002, lng: station.lng };
    const list = [img("pano", south, 0, { isPano: true }), img("noheading", south, null), img("far", far, 0), img("same", station, 0)];
    expect(pickFacingImage(list, station)).toBeNull();
  });
  it("lebih suka foto yang lebih baru bila sama-sama pas", () => {
    const old = img("old", south, 0, { capturedAt: Date.now() - 6 * 365 * 24 * 3600_000 });
    const fresh = img("fresh", south, 0, { capturedAt: Date.now() - 30 * 24 * 3600_000 });
    expect(pickFacingImage([old, fresh], station)?.id).toBe("fresh");
  });
  it("menolak foto dengan skor buruk (maxScore)", () => {
    // Foto jauh (55m) dengan sudut miring (30°) dan sangat tua → skor tinggi → ditolak
    const farEdge = { lat: station.lat - 0.0005, lng: station.lng };
    const marginal = img("marginal", farEdge, 30, { capturedAt: Date.now() - 7 * 365 * 24 * 3600_000 });
    expect(pickFacingImage([marginal], station, { maxScore: 40 })).toBeNull();
  });
});
