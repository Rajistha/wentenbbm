// Webhook dari Better Stack (atau pemantau lain) yang menulis uptime_checks.
// Body: { target: "site" | "snapshot" | "database" | "realtime", ok: boolean, status_code?: number, latency_ms?: number }
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET = Deno.env.get("UPTIME_WEBHOOK_SECRET");
const TARGETS = new Set(["site", "snapshot", "database", "realtime"]);

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-webhook-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const checks = Array.isArray(body) ? body : [body];
  const rows = checks
    .filter((c) => c && TARGETS.has(c.target) && typeof c.ok === "boolean")
    .map((c) => ({ target: c.target, ok: c.ok, status_code: c.status_code ?? null, latency_ms: c.latency_ms ?? null }));
  if (!rows.length) return new Response("bad request", { status: 400 });
  const { error } = await supabase.from("uptime_checks").insert(rows);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, n: rows.length });
});
