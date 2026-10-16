import { IS_DEMO } from "@/lib/env";

export const dynamic = "force-dynamic";

// Pengganti supabase.rpc() saat mode demo. Tidak tersedia bila Supabase dikonfigurasi.
export async function POST(req: Request, ctx: RouteContext<"/api/demo/rpc/[fn]">) {
  if (!IS_DEMO) return new Response("Not found", { status: 404 });
  const { fn } = await ctx.params;
  const device = req.headers.get("x-demo-device")?.slice(0, 64) || "anon";
  const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const store = await import("@/lib/demo/store");
  switch (fn) {
    case "submit_report":
      return Response.json(store.demoSubmitReport(device, args));
    case "cast_vote":
      return Response.json(store.demoCastVote(device, args));
    case "suggest_place":
      return Response.json(store.demoSuggestPlace(device, args));
    case "register_visit":
      return Response.json(store.demoRegisterVisit(device));
    case "station_recent_reports":
      return Response.json(store.demoRecentReports(device, args));
    default:
      return new Response("Unknown function", { status: 404 });
  }
}
