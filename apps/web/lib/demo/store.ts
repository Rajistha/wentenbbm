/**
 * Backend tiruan untuk MODE DEMO (tanpa Supabase).
 *
 * Meniru perilaku fungsi SQL di packages/db/supabase/migrations/0004_functions.sql
 * (submit_report, cast_vote, recompute_station_status, snapshot publik) agar website
 * bisa dicoba tanpa database. Data disimpan di memori proses server dan hilang saat restart.
 * Di produksi, logika status hanya ada di SQL (ARCHITECTURE.md bagian 7).
 */
import {
  distanceM,
  encodeFuelType,
  encodePlace,
  encodeStationStatus,
  type FuelAvailability,
  type FuelStatus,
  type FuelType,
  type Place,
  type PlacesPayload,
  type QueueLevel,
  type StationStatus,
  type SummaryCounts,
  type VoteType,
} from "@wenten/core";
import type { RawRecentReport } from "@wenten/db/rpc";
import stationsJson from "@wenten/db/data/stations.json";
import type { AnnouncementRow, DashboardPayload, StatusResponse } from "../types";

const SETTINGS = {
  status_window_min: 120,
  decay_tau_min: 60,
  min_weight: 0.2,
  confirm_window_min: 30,
  geofence_m: 300,
  max_accuracy_m: 100,
  station_cooldown_min: 30,
  hourly_report_limit: 6,
  queue_window_min: 60,
};

export const DEMO_FUEL_TYPES: FuelType[] = [
  { id: 1, code: "pertalite", name: "Pertalite", brand: "pertamina", isFilterTab: true },
  { id: 2, code: "pertamax", name: "Pertamax", brand: "pertamina", isFilterTab: true },
  { id: 5, code: "biosolar", name: "Solar", brand: "pertamina", isFilterTab: true },
  { id: 3, code: "pertamax_turbo", name: "Pertamax Turbo", brand: "pertamina", isFilterTab: false },
  { id: 4, code: "pertamax_green", name: "Pertamax Green", brand: "pertamina", isFilterTab: false },
  { id: 6, code: "dexlite", name: "Dexlite", brand: "pertamina", isFilterTab: false },
  { id: 7, code: "pertamina_dex", name: "Pertamina Dex", brand: "pertamina", isFilterTab: false },
];

interface DemoReport {
  id: string;
  stationId: string;
  reporter: string;
  createdAt: number;
  items: { fuelTypeId: number; availability: FuelAvailability }[];
  queue: QueueLevel | null;
  waitMinutes: number | null;
  note: string | null;
  status: "active" | "quarantined" | "hidden";
  votes: Map<string, VoteType>;
}

interface Rejection {
  at: number;
  kind: "out_of_range" | "rate_limit" | "other";
}

interface DemoState {
  places: Place[];
  byId: Map<string, Place>;
  reports: DemoReport[];
  statuses: Map<string, StationStatus>;
  rejections: Rejection[];
  launchedAt: number;
  lastTick: number;
  onlineNow: number;
  visitorsTotal: number;
  hourlyHistory: DashboardPayload["hourly"];
  announcements: AnnouncementRow[];
}

const MIN = 60_000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;
const uid = () => crypto.randomUUID();

function weightedAvailability(fuelId: number, bias: number): FuelAvailability {
  // Pertalite paling langka (sesuai berita), BBM nonsubsidi sedikit lebih baik
  const scarce = fuelId === 1 ? 0.5 : fuelId === 5 ? 0.45 : 0.3;
  const r = Math.random() + bias;
  if (r < scarce) return "empty";
  if (r < scarce + 0.18) return "limited";
  return "available";
}

function recompute(s: DemoState, stationId: string, now = Date.now()): boolean {
  const place = s.byId.get(stationId);
  if (!place) return false;
  const windowMs = SETTINGS.status_window_min * MIN;
  const tau = SETTINGS.decay_tau_min * MIN;
  const recent = s.reports.filter(
    (r) => r.stationId === stationId && r.status === "active" && now - r.createdAt < windowMs,
  );

  const fuels = place.fuelIds.map((fuelTypeId) => {
    const groups = new Map<FuelAvailability, { w: number; last: number; n: number; reporters: Set<string> }>();
    for (const r of recent) {
      const item = r.items.find((i) => i.fuelTypeId === fuelTypeId);
      if (!item) continue;
      let confirms = 0;
      let disputes = 0;
      for (const v of r.votes.values()) v === "confirm" ? confirms++ : disputes++;
      const w = Math.exp(-(now - r.createdAt) / tau) * Math.max(0, Math.min(2, 1 + 0.3 * confirms - 0.5 * disputes));
      const g = groups.get(item.availability) ?? { w: 0, last: 0, n: 0, reporters: new Set<string>() };
      g.w += w;
      g.last = Math.max(g.last, r.createdAt);
      g.n++;
      if (now - r.createdAt < SETTINGS.confirm_window_min * MIN) g.reporters.add(r.reporter);
      groups.set(item.availability, g);
    }
    const ranked = [...groups.entries()].sort((a, b) => b[1].w - a[1].w || b[1].last - a[1].last);
    const total = ranked.reduce((a, [, g]) => a + g.w, 0);
    const last = ranked.reduce((a, [, g]) => Math.max(a, g.last), 0);
    const top = ranked[0];
    const status: FuelStatus = !top || total < SETTINGS.min_weight ? "unknown" : top[0];
    return {
      fuelTypeId,
      status,
      confirmed: !!top && total >= SETTINGS.min_weight && top[1].reporters.size >= 2,
      lastReportAt: last ? new Date(last).toISOString() : null,
    };
  });

  const known = fuels.filter((f) => f.status !== "unknown");
  const overall: FuelStatus = known.some((f) => f.status === "available")
    ? "available"
    : known.some((f) => f.status === "limited")
      ? "limited"
      : known.some((f) => f.status === "empty")
        ? "empty"
        : "unknown";

  const qWin = SETTINGS.queue_window_min * MIN;
  const queueReport = recent
    .filter((r) => r.queue && now - r.createdAt < qWin)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const waits = recent
    .filter((r) => r.waitMinutes != null && now - r.createdAt < qWin)
    .map((r) => r.waitMinutes!)
    .sort((a, b) => a - b);
  const pct = (p: number) => {
    const i = (waits.length - 1) * p;
    const lo = Math.floor(i);
    return Math.round(waits[lo]! + (waits[Math.ceil(i)]! - waits[lo]!) * (i - lo));
  };
  const lastKnown = known.map((f) => f.lastReportAt!).sort().at(-1) ?? null;

  const next: StationStatus = {
    id: stationId,
    overall,
    confirmed: known.some((f) => f.confirmed),
    queue: queueReport?.queue ?? null,
    waitLow: waits.length >= 3 ? pct(0.25) : null,
    waitHigh: waits.length >= 3 ? pct(0.75) : null,
    lastReportAt: lastKnown,
    fuels: known,
  };
  const prev = s.statuses.get(stationId);
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (next.overall === "unknown" && !next.queue) s.statuses.delete(stationId);
  else s.statuses.set(stationId, next);
  return changed;
}

function addRandomReport(s: DemoState, at: number) {
  // Pelapor tiruan lebih banyak di Denpasar dan Badung
  const pool = s.places.filter((p) => p.kind === "spbu");
  const weighted = pool.filter((p) => p.regionId === 1 || p.regionId === 2);
  const place = Math.random() < 0.55 ? pick(weighted) : pick(pool);
  const prev = s.reports.filter((r) => r.stationId === place.id && r.status === "active").at(-1);
  const bias = rand(-0.2, 0.2);
  const items = place.fuelIds
    .filter((f) => f <= 2 || f === 5 || Math.random() < 0.35)
    .map((fuelTypeId) => {
      const same = prev?.items.find((i) => i.fuelTypeId === fuelTypeId);
      // laporan berurutan cenderung saling menguatkan
      const availability = same && Math.random() < 0.7 ? same.availability : weightedAvailability(fuelTypeId, bias);
      return { fuelTypeId, availability };
    });
  if (!items.length) return;
  const anyAvail = items.some((i) => i.availability !== "empty");
  const queue: QueueLevel = !anyAvail ? "none" : pick<QueueLevel>(["short", "medium", "medium", "long", "long"]);
  const waitMinutes =
    Math.random() < 0.6 && anyAvail ? Math.round(queue === "long" ? rand(30, 70) : queue === "medium" ? rand(10, 35) : rand(2, 12)) : null;
  const notes = [
    null, null, null, null,
    "Antrean sampai jalan raya",
    "Pertalite habis sejak siang",
    "Maksimal Rp50 ribu per pengisian",
    "Tangki baru datang",
    "Petugas bilang stok datang sore",
    "Antre lancar",
  ];
  const r: DemoReport = {
    id: uid(),
    stationId: place.id,
    reporter: `demo-${Math.floor(rand(0, 4000))}`,
    createdAt: at,
    items,
    queue,
    waitMinutes,
    note: pick(notes),
    status: "active",
    votes: new Map(),
  };
  const nVotes = Math.random() < 0.3 ? Math.floor(rand(1, 4)) : 0;
  for (let i = 0; i < nVotes; i++) r.votes.set(`demo-v${i}-${r.id}`, Math.random() < 0.85 ? "confirm" : "dispute");
  s.reports.push(r);
}

function seed(): DemoState {
  const places: Place[] = (stationsJson as Array<Omit<Place, "fuelIds"> & { fuelIds: number[] }>).map((p) => ({
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    brand: p.brand,
    code: p.code,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    regionId: p.regionId,
    is24h: p.is24h,
    fuelIds: p.fuelIds,
    address: p.address,
  }));
  const now = Date.now();
  const s: DemoState = {
    places,
    byId: new Map(places.map((p) => [p.id, p])),
    reports: [],
    statuses: new Map(),
    rejections: [],
    launchedAt: now - 34 * 60 * MIN,
    lastTick: now,
    onlineNow: Math.round(rand(900, 1300)),
    visitorsTotal: Math.round(rand(180_000, 240_000)),
    hourlyHistory: [],
    announcements: [
      {
        id: "demo-ann-1",
        title: "Tambahan pasokan BBM tiba bertahap",
        body: "Pertamina menjadwalkan tambahan pasokan tiba bertahap hingga 16 Oktober. Isi secukupnya agar semua kebagian.",
        level: "info",
        region_id: null,
        ends_at: new Date(now + 3 * 24 * 60 * MIN).toISOString(),
      },
    ],
  };

  // Laporan 2,5 jam terakhir agar peta langsung terisi
  for (let i = 0; i < 320; i++) addRandomReport(s, now - rand(0, 150) * MIN);
  s.reports.sort((a, b) => a.createdAt - b.createdAt);
  for (const p of places) recompute(s, p.id, now);

  // Riwayat per jam (48 jam) untuk halaman /data
  const hourNow = Math.floor(now / (60 * MIN)) * 60 * MIN;
  for (let h = 47; h >= 0; h--) {
    const t = hourNow - h * 60 * MIN;
    const witaHour = (new Date(t).getUTCHours() + 8) % 24;
    const day = witaHour >= 6 && witaHour <= 21 ? 1 : 0.15;
    const growth = 0.4 + 0.6 * ((47 - h) / 47);
    const n = Math.round((300 + 900 * Math.sin((Math.PI * Math.max(0, witaHour - 6)) / 16)) * day * growth + rand(0, 60));
    const a = Math.round(n * rand(0.3, 0.45));
    const l = Math.round(n * rand(0.1, 0.18));
    s.hourlyHistory.push([new Date(t).toISOString(), a, l, Math.max(0, n - a - l), Math.round(n * 0.62), Math.round(rand(15, 45))]);
  }
  return s;
}

const g = globalThis as unknown as { __wentenDemo?: DemoState };
function state(): DemoState {
  if (!g.__wentenDemo) g.__wentenDemo = seed();
  const s = g.__wentenDemo;
  // Simulasi warga lain: satu laporan baru tiap ~25 detik sejak akses terakhir (maks 6 sekaligus)
  const now = Date.now();
  const ticks = Math.min(6, Math.floor((now - s.lastTick) / 25_000));
  if (ticks > 0) {
    for (let i = 0; i < ticks; i++) addRandomReport(s, now - rand(0, 20_000));
    s.lastTick = now;
    s.onlineNow = Math.max(300, Math.round(s.onlineNow + rand(-40, 40)));
    s.visitorsTotal += Math.round(rand(20, 90));
    // peluruhan (job decay-status) untuk semua SPBU berstatus
    for (const id of new Set([...s.statuses.keys(), ...s.reports.slice(-ticks).map((r) => r.stationId)])) {
      recompute(s, id, now);
    }
  }
  return s;
}

// ───────────── Jalur baca ─────────────

export function demoPlaces(): PlacesPayload {
  const s = state();
  return {
    v: 1,
    generated_at: new Date().toISOString(),
    fuel_types: DEMO_FUEL_TYPES.map(encodeFuelType),
    places: s.places.map(encodePlace),
  };
}

export function demoStatus(): StatusResponse {
  const s = state();
  const summary: Record<string, SummaryCounts> = {};
  const rank = { available: 0, limited: 1, empty: 2, unknown: 3 } as const;
  const all: SummaryCounts = [0, 0, 0, 0];
  for (const p of s.places) {
    if (p.kind !== "spbu") continue;
    const st = s.statuses.get(p.id);
    all[rank[st?.overall ?? "unknown"]]++;
    for (const f of p.fuelIds) {
      const c = (summary[f] ??= [0, 0, 0, 0]);
      c[rank[st?.fuels.find((x) => x.fuelTypeId === f)?.status ?? "unknown"]]++;
    }
  }
  summary.all = all;
  return {
    generated_at: new Date().toISOString(),
    online_now: s.onlineNow,
    reports_total: s.reports.filter((r) => r.status === "active").length + 8000,
    visitors_total: s.visitorsTotal,
    summary,
    stations: [...s.statuses.values()].map(encodeStationStatus),
    read_only: false,
    announcements: s.announcements,
    demo: true,
  };
}

export function demoPlaceBySlug(slug: string) {
  const s = state();
  const place = s.places.find((p) => p.slug === slug);
  return place ? { place, status: s.statuses.get(place.id) ?? null } : null;
}

export function demoDashboard(): DashboardPayload {
  const s = state();
  const now = Date.now();
  const regionsMap = new Map<string, [number, number, number, number, number, number]>();
  for (const p of s.places) {
    if (p.kind !== "spbu" || p.regionId == null) continue;
    const st = s.statuses.get(p.id);
    for (const f of p.fuelIds) {
      const key = `${p.regionId}:${f}`;
      const row = regionsMap.get(key) ?? [p.regionId, f, 0, 0, 0, 0];
      const fs = st?.fuels.find((x) => x.fuelTypeId === f)?.status ?? "unknown";
      row[{ available: 2, limited: 3, empty: 4, unknown: 5 }[fs]]++;
      regionsMap.set(key, row);
    }
  }
  const hourly = [...s.hourlyHistory];
  const last = hourly.at(-1);
  if (last) {
    // jam berjalan ditambah laporan nyata dari sesi demo
    const cur = s.reports.filter((r) => r.status === "active" && now - r.createdAt < 60 * MIN);
    last[4] = Math.max(last[4], cur.length);
  }
  const uptime: DashboardPayload["uptime"] = [];
  for (let h = 34; h >= 0; h--) {
    const t = Math.floor(now / (60 * MIN)) * 60 * MIN - h * 60 * MIN;
    const ok = h === 27 ? 48 : h === 12 ? 30 : 60;
    uptime.push([new Date(t).toISOString(), h === 20 ? 0 : ok, h === 20 ? 0 : 60]);
  }
  const rej24 = s.rejections.filter((r) => now - r.at < 24 * 60 * MIN);
  return {
    generated_at: new Date().toISOString(),
    launched_at: new Date(s.launchedAt).toISOString(),
    visitors_total: s.visitorsTotal,
    online_now: s.onlineNow,
    reports_accepted: hourly.reduce((a, r) => a + r[4], 0),
    reporters_unique: Math.round(hourly.reduce((a, r) => a + r[4], 0) * 0.61),
    stations_fresh: [...s.statuses.values()].filter((x) => x.overall !== "unknown" && s.byId.get(x.id)?.kind === "spbu").length,
    stations_total: s.places.filter((p) => p.kind === "spbu").length,
    hourly,
    regions: [...regionsMap.values()],
    uptime,
    incidents: [
      {
        id: "demo-inc-1",
        kind: "spam",
        started_at: new Date(now - 27 * 60 * MIN).toISOString(),
        ended_at: new Date(now - 26.6 * 60 * MIN).toISOString(),
        title: "Lonjakan laporan otomatis",
        body: "Skrip mengirim laporan massal dari beberapa IP. Laporan dikarantina otomatis dan tidak memengaruhi status.",
      },
      {
        id: "demo-inc-2",
        kind: "partial",
        started_at: new Date(now - 12.4 * 60 * MIN).toISOString(),
        ended_at: new Date(now - 11.9 * 60 * MIN).toISOString(),
        title: "Pembaruan langsung tertunda",
        body: "Kanal realtime penuh, peta beralih ke pembaruan tiap 60 detik.",
      },
    ],
    rejections_24h: {
      out_of_range: 812 + rej24.filter((r) => r.kind === "out_of_range").length,
      rate_limit: 245 + rej24.filter((r) => r.kind === "rate_limit").length,
      other: 37 + rej24.filter((r) => r.kind === "other").length,
      quarantined_reports: 3410,
      quarantined_places: 0,
    },
    demo: true,
  };
}

// ───────────── Jalur tulis (meniru RPC) ─────────────

type Json = Record<string, unknown>;

function reject(s: DemoState, kind: Rejection["kind"], body: Json) {
  s.rejections.push({ at: Date.now(), kind });
  return body;
}

export function demoSubmitReport(device: string, a: Json): Json {
  const s = state();
  const place = s.byId.get(String(a.p_station_id));
  if (!place || place.kind === "terminal") return { ok: false, code: "STATION_NOT_FOUND" };
  const acc = Number(a.p_accuracy_m);
  if (!Number.isFinite(acc) || acc > SETTINGS.max_accuracy_m) {
    return reject(s, "other", { ok: false, code: "LOW_ACCURACY" });
  }
  const d = distanceM({ lat: Number(a.p_lat), lng: Number(a.p_lng) }, place);
  if (d > SETTINGS.geofence_m) {
    return reject(s, "out_of_range", { ok: false, code: "OUT_OF_RANGE", distance_m: Math.round(d) });
  }
  const now = Date.now();
  const mine = s.reports.filter((r) => r.reporter === device);
  if (mine.some((r) => r.stationId === place.id && now - r.createdAt < SETTINGS.station_cooldown_min * MIN)) {
    return reject(s, "rate_limit", { ok: false, code: "RATE_LIMIT_STATION" });
  }
  if (mine.filter((r) => now - r.createdAt < 60 * MIN).length >= SETTINGS.hourly_report_limit) {
    return reject(s, "rate_limit", { ok: false, code: "RATE_LIMIT_HOURLY" });
  }
  const items = Array.isArray(a.p_items) ? (a.p_items as { fuel_type_id: number; availability: FuelAvailability }[]) : [];
  const valid = new Set(
    items
      .filter((i) => place.fuelIds.includes(Number(i.fuel_type_id)) && ["available", "limited", "empty"].includes(i.availability))
      .map((i) => Number(i.fuel_type_id)),
  );
  if (!valid.size || valid.size !== items.length) return { ok: false, code: "INVALID_ITEMS" };

  // Karantina senyap: perjalanan mustahil (> 120 km/jam)
  let status: DemoReport["status"] = "active";
  const prev = mine.at(-1);
  if (prev) {
    const prevPlace = s.byId.get(prev.stationId)!;
    if (distanceM(prevPlace, place) / Math.max((now - prev.createdAt) / 1000, 1) > 33.3) status = "quarantined";
  }

  const r: DemoReport = {
    id: uid(),
    stationId: place.id,
    reporter: device,
    createdAt: now,
    items: items.map((i) => ({ fuelTypeId: Number(i.fuel_type_id), availability: i.availability })),
    queue: (a.p_queue_level as QueueLevel) ?? null,
    waitMinutes: a.p_wait_minutes == null ? null : Math.max(0, Math.min(600, Number(a.p_wait_minutes))),
    note: typeof a.p_note === "string" && a.p_note.trim() ? a.p_note.trim().slice(0, 140) : null,
    status,
    votes: new Map(),
  };
  s.reports.push(r);
  if (status === "active") recompute(s, place.id, now);
  return { ok: true, report_id: r.id };
}

export function demoCastVote(device: string, a: Json): Json {
  const s = state();
  const now = Date.now();
  const r = s.reports.find((x) => x.id === a.p_report_id && x.status === "active" && now - x.createdAt < 24 * 60 * MIN);
  if (!r) return { ok: false, code: "REPORT_NOT_FOUND" };
  if (r.reporter === device) return { ok: false, code: "OWN_REPORT" };
  const place = s.byId.get(r.stationId)!;
  if (Number(a.p_accuracy_m) > SETTINGS.max_accuracy_m) return reject(s, "other", { ok: false, code: "LOW_ACCURACY" });
  const d = distanceM({ lat: Number(a.p_lat), lng: Number(a.p_lng) }, place);
  if (d > SETTINGS.geofence_m) return reject(s, "out_of_range", { ok: false, code: "OUT_OF_RANGE", distance_m: Math.round(d) });
  if (r.votes.has(device)) return { ok: false, code: "ALREADY_VOTED" };
  r.votes.set(device, a.p_vote === "dispute" ? "dispute" : "confirm");
  recompute(s, r.stationId, now);
  const votes = [...r.votes.values()];
  return { ok: true, confirms: votes.filter((v) => v === "confirm").length, disputes: votes.filter((v) => v === "dispute").length };
}

export function demoRecentReports(device: string, a: Json): RawRecentReport[] {
  const s = state();
  const now = Date.now();
  const limit = Math.min(20, Math.max(1, Number(a.p_limit ?? 5)));
  return s.reports
    .filter(
      (r) =>
        r.stationId === a.p_station_id &&
        now - r.createdAt < 24 * 60 * MIN &&
        (r.status === "active" || (r.status === "quarantined" && r.reporter === device)),
    )
    .sort((x, y) => y.createdAt - x.createdAt)
    .slice(0, limit)
    .map((r) => {
      const votes = [...r.votes.values()];
      return {
        id: r.id,
        created_at: new Date(r.createdAt).toISOString(),
        queue: r.queue,
        wait_minutes: r.waitMinutes,
        note: r.note,
        items: r.items.map((i) => ({ fuel_type_id: i.fuelTypeId, availability: i.availability })),
        confirms: votes.filter((v) => v === "confirm").length,
        disputes: votes.filter((v) => v === "dispute").length,
        is_mine: r.reporter === device,
        my_vote: r.votes.get(device) ?? null,
      };
    });
}

const seenToday = new Set<string>();
let seenDay = "";

/** Meniru register_visit(): satu perangkat dihitung sekali per hari. */
export function demoRegisterVisit(device: string): Json {
  const s = state();
  const day = new Date().toISOString().slice(0, 10);
  if (day !== seenDay) {
    seenDay = day;
    seenToday.clear();
  }
  if (!seenToday.has(device)) {
    seenToday.add(device);
    s.visitorsTotal += 1;
  }
  return { ok: true };
}
