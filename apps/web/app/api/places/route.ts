import { getPlacesPayload } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const body = await getPlacesPayload();
    return Response.json(body, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "places_unavailable" }, { status: 503 });
  }
}
