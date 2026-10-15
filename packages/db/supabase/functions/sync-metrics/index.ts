// Menarik pengunjung online dan unik dari Plausible ke site_metrics_live / site_metrics_hourly.
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const KEY = Deno.env.get("PLAUSIBLE_API_KEY");
const SITE = Deno.env.get("PLAUSIBLE_SITE_ID") ?? "wentenbbm.id";
const BASE = Deno.env.get("PLAUSIBLE_BASE_URL") ?? "https://plausible.io";

async function plausible(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`Plausible ${res.status}`);
  return res.json();
}

Deno.serve(async () => {
  if (!KEY) return Response.json({ ok: false, error: "PLAUSIBLE_API_KEY belum diisi" });
  try {
    const online: number = await plausible(`/api/v1/stats/realtime/visitors?site_id=${SITE}`);
    const { data: live } = await supabase.from("site_metrics_live").select("launched_at").eq("id", 1).single();
    const since = (live?.launched_at ?? new Date().toISOString()).slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const agg = await plausible(
      `/api/v1/stats/aggregate?site_id=${SITE}&period=custom&date=${since},${today}&metrics=visitors,pageviews`,
    );
    await supabase
      .from("site_metrics_live")
      .update({ online_now: online, visitors_total: agg.results.visitors.value, updated_at: new Date().toISOString() })
      .eq("id", 1);

    const hour = new Date();
    hour.setUTCMinutes(0, 0, 0);
    const { data: prev } = await supabase
      .from("site_metrics_hourly")
      .select("peak_online")
      .eq("hour", hour.toISOString())
      .maybeSingle();
    await supabase.from("site_metrics_hourly").upsert({
      hour: hour.toISOString(),
      peak_online: Math.max(online, prev?.peak_online ?? 0),
    });
    return Response.json({ ok: true, online });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
