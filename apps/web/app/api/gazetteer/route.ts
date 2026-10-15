import gazetteer from "@wenten/db/data/gazetteer.json";

// Daftar nama wilayah/desa Bali untuk saran pencarian tempat. Jarang berubah, cache panjang.
export const dynamic = "force-static";

export function GET() {
  return Response.json(gazetteer, {
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800" },
  });
}
