import { getStatusPayload } from "@/lib/backend/server";
import { IS_DEMO } from "@/lib/env";

export const dynamic = "force-dynamic";

// Bisa dinaikkan dari 15 ke 60 detik saat lonjakan trafik tanpa ubah kode (ARCHITECTURE.md 9)
const CACHE_S = Number(process.env.STATUS_CACHE_SECONDS ?? 15);

export async function GET() {
  try {
    const body = await getStatusPayload();
    return Response.json(body, {
      headers: {
        // Mode demo: data di memori proses, jangan di-cache agar laporan sendiri langsung terlihat
        "Cache-Control": IS_DEMO
          ? "no-store"
          : `public, s-maxage=${CACHE_S}, stale-while-revalidate=${CACHE_S * 4}`,
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "status_unavailable" }, { status: 503 });
  }
}
