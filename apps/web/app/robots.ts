import type { MetadataRoute } from "next";
import { BASE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/en/admin", "/poster", "/en/poster"] }],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
