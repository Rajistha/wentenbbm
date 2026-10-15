import { getPlaceBySlug } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

/**
 * Kondisi lalu lintas di depan SPBU dari TomTom Traffic Flow (TOMTOM_API_KEY, hanya di server).
 * Ini sinyal kondisi jalan, bukan antrean BBM: kecepatan sekarang dibanding kecepatan lancar.
 * Di-cache 10 menit dan dibatasi anggaran harian supaya kuota gratis tidak habis.
 */
const KEY = process.env.TOMTOM_API_KEY;
const DAILY_BUDGET = Number(process.env.TOMTOM_DAILY_BUDGET ?? 2000);
const TTL = 10 * 60_000;

type Level = "free" | "moderate" | "heavy" | "closed" | "unknown";
interface Traffic {
  level: Level;
  ratio: number | null;
  currentSpeed: number | null;
  freeFlowSpeed: number | null;
  at: string;
}

const g = globalThis as unknown as {
  __trafficCache?: Map<string, { v: Traffic; exp: number }>;
  __trafficBudget?: { day: string; n: number };
};
const cache = (g.__trafficCache ??= new Map());

function spend(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const b = (g.__trafficBudget ??= { day, n: 0 });
  if (b.day !== day) {
    b.day = day;
    b.n = 0;
  }
  if (b.n >= DAILY_BUDGET) return false;
  b.n++;
  return true;
}

function classify(current: number, free: number, confidence: number, closed: boolean): { level: Level; ratio: number | null } {
  if (closed) return { level: "closed", ratio: 0 };
  if (!free || confidence < 0.5) return { level: "unknown", ratio: null };
  const ratio = current / free;
  return { level: ratio >= 0.8 ? "free" : ratio >= 0.55 ? "moderate" : "heavy", ratio: Math.round(ratio * 100) / 100 };
}

const UNKNOWN = (): Traffic => ({ level: "unknown", ratio: null, currentSpeed: null, freeFlowSpeed: null, at: new Date().toISOString() });

export async function GET(_req: Request, ctx: RouteContext<"/api/traffic/[slug]">) {
  const { slug } = await ctx.params;
  if (!KEY) return Response.json({ ...UNKNOWN(), reason: "no_key" }, { headers: { "Cache-Control": "public, max-age=300" } });

  const hit = cache.get(slug);
  if (hit && hit.exp > Date.now()) {
    return Response.json(hit.v, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" } });
  }

  const found = await getPlaceBySlug(slug).catch(() => null);
  if (!found || found.place.kind === "terminal") return Response.json(UNKNOWN(), { status: 404 });
  if (!spend()) return Response.json({ ...UNKNOWN(), reason: "budget" }, { headers: { "Cache-Control": "public, max-age=600" } });

  try {
    const { lat, lng } = found.place;
    const res = await fetch(
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lng}&unit=KMPH&key=${KEY}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) throw new Error(`tomtom ${res.status}`);
    const f = ((await res.json()) as { flowSegmentData?: { currentSpeed: number; freeFlowSpeed: number; confidence: number; roadClosure: boolean } }).flowSegmentData;
    if (!f) throw new Error("tomtom: tanpa flowSegmentData");
    const c = classify(f.currentSpeed, f.freeFlowSpeed, f.confidence, f.roadClosure);
    const v: Traffic = {
      level: c.level,
      ratio: c.ratio,
      currentSpeed: Math.round(f.currentSpeed),
      freeFlowSpeed: Math.round(f.freeFlowSpeed),
      at: new Date().toISOString(),
    };
    cache.set(slug, { v, exp: Date.now() + TTL });
    return Response.json(v, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300" } });
  } catch (err) {
    console.error(err);
    const v = UNKNOWN();
    cache.set(slug, { v, exp: Date.now() + 2 * 60_000 });
    return Response.json(v, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
