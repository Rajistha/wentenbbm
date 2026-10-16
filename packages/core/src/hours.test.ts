import { describe, expect, it } from "vitest";
import { openingState } from "./hours";

// 12.00 UTC = 20.00 WITA
const at = (hhWita: number, mm = 0) => Date.UTC(2026, 9, 16, hhWita - 8, mm);

describe("openingState", () => {
  it("24 jam", () => {
    expect(openingState({ slug: "x", is24h: true }, at(3))).toEqual({ kind: "h24" });
  });
  it("tidak tercatat -> null", () => {
    expect(openingState({ slug: "tidak-ada", is24h: false }, at(12))).toBeNull();
  });
  it("buka dan tutup", () => {
    const p = { slug: "spbu-peliatan", is24h: false }; // 05:00-22:00
    expect(openingState(p, at(12))).toEqual({ kind: "open", closesAt: "22.00" });
    expect(openingState(p, at(22, 30))).toEqual({ kind: "closed", opensAt: "05.00" });
    expect(openingState(p, at(4, 59))).toEqual({ kind: "closed", opensAt: "05.00" });
  });
  it("tutup tengah malam", () => {
    const p = { slug: "spbu-panjer-2", is24h: false }; // 05:00-00:00
    expect(openingState(p, at(23, 30))).toEqual({ kind: "open", closesAt: "00.00" });
  });
});
