// Menulis places.json dan status.json ke Storage bucket "snapshots" setiap menit (dipanggil pg_cron).
// Klien memakai status.json ini jika /api/status gagal (ARCHITECTURE.md 3.2 langkah 5).
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function upload(path: string, body: unknown, maxAge: number) {
  const { error } = await supabase.storage
    .from("snapshots")
    .upload(path, new Blob([JSON.stringify(body)], { type: "application/json" }), {
      upsert: true,
      cacheControl: String(maxAge),
      contentType: "application/json",
    });
  if (error) throw error;
}

Deno.serve(async () => {
  try {
    const [places, status] = await Promise.all([
      supabase.rpc("public_places_snapshot"),
      supabase.rpc("public_status_snapshot"),
    ]);
    if (places.error) throw places.error;
    if (status.error) throw status.error;
    await Promise.all([upload("places.json", places.data, 600), upload("status.json", status.data, 30)]);
    return Response.json({ ok: true });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
