import type { Place, PlaceKind } from "./types";

/** Huruf kecil, tanpa aksen, tanda baca jadi spasi. "54.803.11" tetap bisa dicari lewat digit. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\bby\s+pass\b/g, "bypass");
}

/** Jarak edit dengan batas; mengembalikan max+1 bila melebihi. */
function editDistance(a: string, b: string, max = 1): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

// Kata yang dipahami sebagai jenis tempat, bukan nama
const KIND_WORDS: Record<string, PlaceKind[]> = {
  pertamini: ["retailer"],
  petramini: ["retailer"],
  pertamina: [],
  pertashop: ["pertashop"],
  pengecer: ["retailer", "pertashop"],
  eceran: ["retailer", "pertashop"],
  botolan: ["retailer"],
  kios: ["retailer", "pertashop"],
  spbu: ["spbu"],
  pom: ["spbu"],
  bensin: [],
};
const STOP = new Set(["di", "dekat", "the", "near", "gas", "station", "fuel", "bali", "kab", "kabupaten"]);

// Singkatan dan sebutan sehari-hari warga Bali/Denpasar
const ALIASES: Record<string, string> = {
  gatsu: "gatot subroto",
  tuum: "teuku umar",
  ibon: "imam bonjol",
  ayani: "ahmad yani",
  hawuk: "hayam wuruk",
  dipo: "diponegoro",
  cokro: "cokroaminoto",
  sudirman: "sudirman",
  sutomo: "sutomo",
  surapati: "surapati",
  ngurahrai: "ngurah rai",
  nusadua: "nusa dua",
  dentim: "denpasar timur",
  densel: "denpasar selatan",
  denbar: "denpasar barat",
  denut: "denpasar utara",
  dps: "denpasar",
  jl: "jalan",
  jln: "jalan",
  gg: "gang",
  br: "banjar",
  kerobokan: "kerobokan",
  legian: "legian",
  tabanan: "tabanan",
};

/** Normalisasi + perluas singkatan, mis. "jl gatsu" menjadi "jalan gatot subroto". */
export function expandQuery(query: string): string {
  const q = normalize(query).replace(/\bby pass\b/g, "bypass");
  return q
    .split(" ")
    .map((w) => ALIASES[w] ?? w)
    .join(" ");
}

export interface SearchHit {
  place: Place;
  score: number;
}

export interface SearchOptions {
  limit?: number;
}

/**
 * Pencarian ala Google Maps: setiap kata harus cocok di nama, alamat, wilayah, atau nomor SPBU,
 * awalan kata lebih tinggi nilainya, dan salah ketik satu huruf masih ditoleransi.
 * Kata seperti "pertamini", "pertashop", "spbu" menyaring jenis tempat.
 */
export function searchStations(
  places: Place[],
  query: string,
  regionNames: Record<number, string> = {},
  opts: SearchOptions = {},
): SearchHit[] {
  const q = expandQuery(query);
  if (!q) return [];
  const words = q.split(" ").filter((w) => !STOP.has(w));
  const kinds = new Set<PlaceKind>();
  let hasKindWord = false;
  const tokens: string[] = [];
  for (const w of words) {
    const k = KIND_WORDS[w];
    if (k) {
      hasKindWord = true;
      k.forEach((x) => kinds.add(x));
    } else tokens.push(w);
  }

  // "54.801.35" dinormalisasi jadi "54 801 35": gabungkan deretan angka jadi satu kata
  for (let i = tokens.length - 2; i >= 0; i--) {
    if (/^\d+$/.test(tokens[i]!) && /^\d+$/.test(tokens[i + 1]!)) tokens.splice(i, 2, tokens[i]! + tokens[i + 1]!);
  }

  const hits: SearchHit[] = [];
  for (const p of places) {
    if (p.kind === "terminal") continue;
    if (hasKindWord && kinds.size && !kinds.has(p.kind)) continue;

    const name = normalize(p.name);
    const nameWords = name.split(" ");
    const rest = normalize(`${p.address ?? ""} ${p.regionId != null ? regionNames[p.regionId] ?? "" : ""}`);
    const restWords = rest.split(" ");
    const digits = (p.code ?? "").replace(/\D/g, "");

    let score = 0;
    let ok = true;
    for (const t of tokens) {
      let best = 0;
      if (nameWords.some((w) => w.startsWith(t))) best = 10;
      else if (name.includes(t)) best = 6;
      else if (/^\d{3,}$/.test(t) && digits.includes(t)) best = 9;
      else if (restWords.some((w) => w.startsWith(t))) best = 4;
      else if (rest.includes(t)) best = 2;
      else if (t.length >= 4 && [...nameWords, ...restWords].some((w) => w.length >= 4 && editDistance(t, w) <= 1)) best = 3;
      if (!best) {
        ok = false;
        break;
      }
      score += best;
    }
    if (!ok) continue;
    if (tokens.length && name.startsWith(tokens.join(" "))) score += 5;
    if (p.kind === "spbu") score += 0.5;
    if (!tokens.length) score = 1;
    hits.push({ place: p, score });
  }
  hits.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}

export interface GazetteerEntry {
  name: string;
  type: "city" | "town" | "suburb" | "village" | "neighbourhood" | "region" | "street" | "terminal";
  /** Keterangan tambahan, mis. kelurahan untuk jalan. */
  sub?: string;
  lat: number;
  lng: number;
}

const TYPE_RANK: Record<GazetteerEntry["type"], number> = {
  region: 0,
  street: 1,
  terminal: 1,
  city: 1,
  town: 2,
  suburb: 3,
  village: 4,
  neighbourhood: 5,
};

/** Nama jalan dari alamat SPBU ("Jalan X, Kelurahan"), dipusatkan di rata-rata lokasi SPBU di jalan itu. */
export function deriveStreets(places: Place[]): GazetteerEntry[] {
  const groups = new Map<string, { name: string; sub: Map<string, number>; lat: number; lng: number; n: number }>();
  for (const p of places) {
    const a = p.address;
    if (!a || a.startsWith("Dekat ")) continue;
    const i = a.lastIndexOf(",");
    if (i < 0) continue;
    const street = a.slice(0, i).replace(/\s+\d+[a-z]?$/i, "").trim();
    const locality = a.slice(i + 1).trim();
    if (!/^(jalan|jl|gang|gg)\b/i.test(street) && !/\s/.test(street)) continue;
    const label = /^(jalan|jl|gang|gg)\b/i.test(street) ? street : `Jalan ${street}`;
    const key = normalize(label);
    const g = groups.get(key) ?? { name: label, sub: new Map(), lat: 0, lng: 0, n: 0 };
    g.lat += p.lat;
    g.lng += p.lng;
    g.n++;
    g.sub.set(locality, (g.sub.get(locality) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    name: g.name,
    type: "street" as const,
    lat: g.lat / g.n,
    lng: g.lng / g.n,
    sub: [...g.sub.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
  }));
}

/** Cari nama wilayah, desa, atau jalan untuk memindahkan peta (mis. "Kuta", "Gatsu"). */
export function searchGazetteer(entries: GazetteerEntry[], query: string, limit = 4): GazetteerEntry[] {
  const q = expandQuery(query);
  if (q.length < 2) return [];
  const tokens = q.split(" ").filter((w) => !STOP.has(w) && w !== "jalan" && w !== "gang");
  if (!tokens.length) return [];
  const scored: { e: GazetteerEntry; s: number }[] = [];
  for (const e of entries) {
    const n = normalize(e.name);
    const words = n.split(" ");
    const core = words.filter((w) => w !== "jalan" && w !== "gang").join(" ");
    let s = 0;
    if (core === tokens.join(" ")) s = 100;
    else if (core.startsWith(tokens.join(" "))) s = 70;
    else if (tokens.every((t) => words.some((w) => w.startsWith(t)))) s = 45;
    else if (tokens.length === 1 && tokens[0]!.length >= 4 && words.some((w) => w.length >= 4 && editDistance(tokens[0]!, w, 1) <= 1)) s = 25;
    else continue;
    scored.push({ e, s: s - TYPE_RANK[e.type] * 3 - n.length * 0.1 });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.e);
}
