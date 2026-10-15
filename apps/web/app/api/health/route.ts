import { checkHealth } from "@/lib/backend/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const h = await checkHealth();
  return Response.json({ ...h, time: new Date().toISOString() }, {
    status: h.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
