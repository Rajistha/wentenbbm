/**
 * Impor SPBU Bali dari OpenStreetMap (amenity=fuel di dalam batas Provinsi Bali).
 *
 *   node scripts/import-osm.ts            # pakai cache data/osm-*.json
 *   node scripts/import-osm.ts --fetch    # ambil ulang dari Overpass
 *
 * Keluaran:
 *   data/stations.json      dipakai mode demo apps/web dan sebagai bahan verifikasi manual
 *   supabase/seed.sql       data awal stations + station_fuels
 *
 * Hasil impor WAJIB diverifikasi manual (nama, nomor SPBU, jenis BBM) sebelum rilis (ERD.md bagian 6).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

const QUERIES = {
  "osm-raw.json":
    '[out:json][timeout:90];area["ISO3166-2"="ID-BA"]->.bali;(node["amenity"="fuel"](area.bali);way["amenity"="fuel"](area.bali););out center tags;',
  "osm-regions.json":
    '[out:json][timeout:150];area["ISO3166-2"="ID-BA"]->.bali;rel(area.bali)["admin_level"="5"]["boundary"="administrative"];map_to_area->.regs;foreach.regs->.r(.r out tags;(node(area.r)["amenity"="fuel"];way(area.r)["amenity"="fuel"];);out ids;);',
  "osm-localities.json":
    '[out:json][timeout:150];area["ISO3166-2"="ID-BA"]->.bali;node(area.bali)["place"~"^(city|town|suburb|village|neighbourhood|quarter)$"]["name"];out body;',
} as const;

interface OsmElement {
  type: "node" | "way" | "area";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const REGION_IDS: Record<string, number> = {
  Denpasar: 1,
  Badung: 2,
  Gianyar: 3,
  Tabanan: 4,
  Jembrana: 5,
  Buleleng: 6,
  Bangli: 7,
  Klungkung: 8,
  Karangasem: 9,
};

// Isi bawaan per jenis tempat jika OSM tidak punya tag fuel:* (lihat seed fuel_types di migrasi 0003).
const DEFAULT_FUELS: Record<string, number[]> = {
  spbu: [1, 2, 3, 5, 6],
  pertashop: [2],
  retailer: [1],
};

async function load(file: keyof typeof QUERIES): Promise<{ elements: OsmElement[] }> {
  const path = join(DATA, file);
  if (process.argv.includes("--fetch")) {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "user-agent": "wentenbbm-import/1.0", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: QUERIES[file] }),
    });
    if (!res.ok) throw new Error(`Overpass ${res.status} untuk ${file}`);
    writeFileSync(path, await res.text());
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

const uuidFrom = (s: string) => {
  const h = createHash("sha1").update(`wentenbbm:${s}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");

const sq = (v: string | null | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);

const GENERIC = /^(pertamina|pt\.? pertamina|spbu|spbu pertamina|fuel station|pompa bensin|gas station|independent|small place|small garage|petramina|petrolimex|c[ửu]a h[àa]ng x[ăa]ng d[ầa]u)$/i;

function classify(tags: Record<string, string>): "spbu" | "pertashop" | "retailer" | null {
  const s = `${tags.name ?? ""} ${tags.brand ?? ""} ${tags.operator ?? ""}`.toLowerCase();
  if (/minicon|nitrogen|penghemat/.test(s)) return null;
  if (/pertashop/.test(s)) return "pertashop";
  if (/pertamini|petramini|motorbike|botol|eceran/.test(s)) return "retailer";
  return "spbu";
}

function brandOf(tags: Record<string, string>, kind: string) {
  const s = `${tags.brand ?? ""} ${tags.name ?? ""}`.toLowerCase();
  if (/shell/.test(s)) return "shell";
  if (/\bbp\b/.test(s)) return "bp";
  if (/vivo/.test(s)) return "vivo";
  return kind === "retailer" ? "none" : "pertamina";
}

function codeOf(tags: Record<string, string>) {
  const m = `${tags.ref ?? ""} ${tags.name ?? ""}`.match(/\b(\d{2})\.?(\d{3})\.?(\d{2,3})\b/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

function fuelsOf(tags: Record<string, string>, kind: string) {
  const set = new Set(DEFAULT_FUELS[kind]);
  if (tags["fuel:octane_90"] === "yes" || tags["fuel:octane_88"] === "yes") set.add(1);
  if (tags["fuel:octane_92"] === "yes") set.add(2);
  if (tags["fuel:octane_98"] === "yes") set.add(3);
  if (tags["fuel:octane_95"] === "yes") set.add(4);
  if (tags["fuel:diesel"] === "yes") set.add(5);
  if (tags["fuel:GTL_diesel"] === "yes") set.add(7);
  return [...set].sort((a, b) => a - b);
}

function dist(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const k = Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(a.lat - b.lat, (a.lon - b.lon) * k);
}

async function main() {
  const raw = await load("osm-raw.json");
  const regions = await load("osm-regions.json");
  const localities = (await load("osm-localities.json")).elements.filter((e) => e.lat && e.tags?.name);

  const regionOf = new Map<string, number>();
  let cur: number | undefined;
  for (const e of regions.elements) {
    if (e.type === "area") cur = REGION_IDS[e.tags?.name ?? ""];
    else if (cur) regionOf.set(`${e.type}/${e.id}`, cur);
  }

  const nearestLocality = (p: { lat: number; lon: number }) => {
    let best = localities[0]!;
    let bd = Infinity;
    for (const l of localities) {
      const d = dist(p, { lat: l.lat!, lon: l.lon! });
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best.tags!.name!.replace(/^(Desa|Kelurahan|Banjar)\s+/i, "");
  };

  const usedNames = new Map<string, number>();
  const usedSlugs = new Set<string>();
  const out: {
    id: string;
    slug: string;
    kind: string;
    brand: string;
    code: string | null;
    name: string;
    address: string | null;
    regionId: number | null;
    lat: number;
    lng: number;
    is24h: boolean;
    osmId: number;
    fuelIds: number[];
  }[] = [];

  for (const e of raw.elements) {
    const tags = e.tags ?? {};
    const kind = classify(tags);
    if (!kind) continue;
    const pos = e.center ?? { lat: e.lat!, lon: e.lon! };
    const locality = nearestLocality(pos);
    const code = codeOf(tags);

    let base = (tags.name ?? "").trim();
    base = base
      .replace(/\b\d{2}\.?\d{3}\.?\d{2,3}\b/, "")
      .replace(/\b(spbu|pertamina|pt\.?|pom bensin)\b/gi, "")
      .replace(/\(\s*\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!base || GENERIC.test(tags.name ?? "") || GENERIC.test(base)) base = locality;
    const prefix = kind === "spbu" ? "SPBU" : kind === "pertashop" ? "Pertashop" : "Pengecer";
    let name = /^pertashop/i.test(base) ? base.replace(/^pertashop/i, "Pertashop") : `${prefix} ${base}`;
    const n = (usedNames.get(name) ?? 0) + 1;
    usedNames.set(name, n);
    if (n > 1) name = `${name} ${n}`;

    let slug = slugify(name);
    while (usedSlugs.has(slug)) slug += "-x";
    usedSlugs.add(slug);

    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const address = street ? `${street}, ${locality}` : `Dekat ${locality}`;

    out.push({
      id: uuidFrom(`${e.type}/${e.id}`),
      slug,
      kind,
      brand: brandOf(tags, kind),
      code,
      name,
      address,
      regionId: regionOf.get(`${e.type}/${e.id}`) ?? null,
      lat: Math.round(pos.lat * 1e6) / 1e6,
      lng: Math.round(pos.lon * 1e6) / 1e6,
      is24h: tags.opening_hours === "24/7",
      osmId: e.type === "way" ? -e.id : e.id,
      fuelIds: fuelsOf(tags, kind),
    });
  }

  // spbu_code unik di tabel stations
  const seenCodes = new Set<string>();
  for (const s of out) {
    if (s.code && seenCodes.has(s.code)) s.code = null;
    if (s.code) seenCodes.add(s.code);
  }

  // Terminal BBM (depo) sebagai titik referensi, tidak bisa dilaporkan
  const terminals = JSON.parse(readFileSync(join(DATA, "terminals.json"), "utf8")) as {
    osm: string; name: string; address: string; regionId: number; lat: number; lng: number; slug: string;
  }[];
  for (const t of terminals) {
    const [type, id] = t.osm.split("/");
    out.push({
      id: uuidFrom(t.osm),
      slug: t.slug,
      kind: "terminal",
      brand: "pertamina",
      code: null,
      name: t.name,
      address: t.address,
      regionId: t.regionId,
      lat: t.lat,
      lng: t.lng,
      is24h: false,
      osmId: type === "way" ? -Number(id) : Number(id),
      fuelIds: [],
    });
  }

  out.sort((a, b) => (a.regionId ?? 99) - (b.regionId ?? 99) || a.name.localeCompare(b.name));
  writeFileSync(join(DATA, "stations.json"), JSON.stringify(out, null, 1));

  const lines = [
    "-- Dihasilkan oleh packages/db/scripts/import-osm.ts dari OpenStreetMap (ODbL).",
    "-- Verifikasi manual sebelum rilis: nama, nomor SPBU, jenis BBM.",
    "",
    "insert into stations (id, slug, kind, brand, spbu_code, name, address, region_id, location, is_24h, source, osm_id) values",
    out
      .map(
        (s) =>
          ` (${sq(s.id)}, ${sq(s.slug)}, '${s.kind}', '${s.brand}', ${sq(s.code)}, ${sq(s.name)}, ${sq(s.address)}, ${s.regionId ?? "null"}, ` +
          `st_setsrid(st_makepoint(${s.lng}, ${s.lat}), 4326)::geography, ${s.is24h}, 'osm', ${s.osmId})`,
      )
      .join(",\n") + "\non conflict (id) do nothing;",
    "",
    "insert into station_fuels (station_id, fuel_type_id) values",
    out.flatMap((s) => s.fuelIds.map((f) => ` (${sq(s.id)}, ${f})`)).join(",\n") + "\non conflict do nothing;",
    "",
  ];
  writeFileSync(join(ROOT, "supabase", "seed.sql"), lines.join("\n"));

  const byKind = out.reduce<Record<string, number>>((a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a), {});
  console.log(`Selesai: ${out.length} tempat`, byKind, `tanpa wilayah: ${out.filter((s) => !s.regionId).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
