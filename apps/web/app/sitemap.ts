import { decodePlaces, REGIONS } from "@wenten/core";
import type { MetadataRoute } from "next";
import { getPlacesPayload } from "@/lib/backend/server";
import { abs } from "@/lib/seo";

export const revalidate = 3600;

function entry(path: string, changeFrequency: "hourly" | "daily" | "weekly", priority: number): MetadataRoute.Sitemap[number] {
  return {
    url: abs("id", path),
    lastModified: new Date(),
    changeFrequency,
    priority,
    alternates: { languages: { id: abs("id", path), en: abs("en", path) } },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const places = decodePlaces(await getPlacesPayload()).places.filter((p) => p.kind !== "terminal");
  const out: MetadataRoute.Sitemap = [entry("/", "hourly", 1), entry("/data", "hourly", 0.7), entry("/tentang", "weekly", 0.4)];
  for (const r of REGIONS) out.push(entry(`/wilayah/${r.slug}`, "hourly", 0.8));
  for (const p of places) out.push(entry(`/spbu/${p.slug}`, "hourly", p.kind === "spbu" ? 0.6 : 0.3));
  return out;
}
