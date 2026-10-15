import { distanceM, pickFacingImage, type StreetImage } from "@wenten/core";
import { getPlaceBySlug } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

/**
 * Foto SPBU otomatis, diambil sesuai permintaan (lazy) dan di-cache di server.
 * Urutan sumber:
 *   1. Google Places (GOOGLE_PLACES_API_KEY, butuh billing)
 *   2. Mapillary (MAPILLARY_ACCESS_TOKEN, gratis): foto jalan yang kameranya menghadap SPBU
 * Atribusi wajib ditampilkan. Kunci hanya di server, tidak pernah dikirim ke klien.
 */
const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY;
const MAPILLARY_TOKEN = process.env.MAPILLARY_ACCESS_TOKEN;

interface Photo {
  url: string | null;
  source: "google" | "mapillary" | null;
  /** Teks atribusi lengkap untuk banner. */
  credit: string | null;
  creditUrl: string | null;
}
const EMPTY: Photo = { url: null, source: null, credit: null, creditUrl: null };

const g = globalThis as unknown as { __photoCache?: Map<string, Photo & { at: number }> };
const cache = (g.__photoCache ??= new Map());
const HIT_TTL = 6 * 3600_000;
const MISS_TTL = 24 * 3600_000;
const CDN = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

// ───────────── Google Places (New) ─────────────
async function fromGoogle(name: string, code: string | null, lat: number, lng: number): Promise<Photo> {
  const q = code ? `SPBU Pertamina ${code}` : `${name.replace(/\s+\d+$/, "")} Bali`;
  const search = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY!,
      "X-Goog-FieldMask": "places.id,places.location,places.photos",
    },
    body: JSON.stringify({
      textQuery: q,
      includedType: "gas_station",
      maxResultCount: 5,
      languageCode: "id",
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 200 } },
    }),
  });
  if (!search.ok) throw new Error(`google searchText ${search.status}`);
  const data = (await search.json()) as {
    places?: {
      id: string;
      location: { latitude: number; longitude: number };
      photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
    }[];
  };
  const dist = (p: { location: { latitude: number; longitude: number } }) =>
    distanceM({ lat, lng }, { lat: p.location.latitude, lng: p.location.longitude });
  const match = (data.places ?? []).filter((p) => p.photos?.length && dist(p) <= 150).sort((a, b) => dist(a) - dist(b))[0];
  const photo = match?.photos?.[0];
  if (!match || !photo) return EMPTY;
  const media = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=640&skipHttpRedirect=true&key=${GOOGLE_KEY}`);
  if (!media.ok) throw new Error(`google media ${media.status}`);
  const { photoUri } = (await media.json()) as { photoUri?: string };
  const author = photo.authorAttributions?.[0];
  return {
    url: photoUri ?? null,
    source: "google",
    credit: `Foto: ${author?.displayName ?? "pengguna"} · Google Maps`,
    creditUrl: author?.uri ?? null,
  };
}

// ───────────── Mapillary ─────────────
async function fromMapillary(lat: number, lng: number): Promise<Photo> {
  // Kotak sekitar 180 m; batas Mapillary untuk bbox adalah 0,01 derajat persegi
  const dLat = 0.0009;
  const dLng = 0.0009 / Math.cos((lat * Math.PI) / 180);
  const url =
    "https://graph.mapillary.com/images?" +
    new URLSearchParams({
      access_token: MAPILLARY_TOKEN!,
      fields: "id,thumb_1024_url,computed_geometry,computed_compass_angle,compass_angle,captured_at,creator,is_pano",
      bbox: `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`,
      limit: "200",
    });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mapillary ${res.status}`);
  const body = (await res.json()) as {
    data?: {
      id: string;
      thumb_1024_url?: string;
      computed_geometry?: { coordinates: [number, number] };
      computed_compass_angle?: number;
      compass_angle?: number;
      captured_at?: number;
      creator?: { username?: string };
      is_pano?: boolean;
    }[];
  };
  const images: StreetImage[] = (body.data ?? [])
    .filter((d) => d.thumb_1024_url && d.computed_geometry?.coordinates)
    .map((d) => ({
      id: d.id,
      url: d.thumb_1024_url!,
      lng: d.computed_geometry!.coordinates[0],
      lat: d.computed_geometry!.coordinates[1],
      heading: d.computed_compass_angle ?? d.compass_angle ?? null,
      capturedAt: d.captured_at ?? null,
      author: d.creator?.username ?? null,
      isPano: !!d.is_pano,
    }));
  const pick = pickFacingImage(images, { lat, lng });
  if (!pick) return EMPTY;
  const year = pick.capturedAt ? new Date(pick.capturedAt).getFullYear() : null;
  return {
    url: pick.url,
    source: "mapillary",
    credit: `Foto: ${pick.author ?? "kontributor"}${year ? ` ${year}` : ""} · Mapillary CC BY-SA`,
    creditUrl: `https://www.mapillary.com/app/?pKey=${pick.id}&focus=photo`,
  };
}

export async function GET(_req: Request, ctx: RouteContext<"/api/photo/[slug]">) {
  const { slug } = await ctx.params;
  if (!GOOGLE_KEY && !MAPILLARY_TOKEN) {
    return Response.json({ ...EMPTY, reason: "no_key" }, { headers: { "Cache-Control": "public, max-age=300" } });
  }
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < (hit.url ? HIT_TTL : MISS_TTL)) return Response.json(hit, { headers: CDN });

  const found = await getPlaceBySlug(slug).catch(() => null);
  if (!found || found.place.kind === "terminal") return Response.json(EMPTY, { status: 404 });
  const { name, code, lat, lng } = found.place;

  try {
    let photo = EMPTY;
    if (GOOGLE_KEY) photo = await fromGoogle(name, code, lat, lng).catch((e) => (console.error(e), EMPTY));
    if (!photo.url && MAPILLARY_TOKEN) photo = await fromMapillary(lat, lng);
    cache.set(slug, { ...photo, at: Date.now() });
    return Response.json(photo, { headers: CDN });
  } catch (err) {
    console.error(err);
    return Response.json(EMPTY, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
