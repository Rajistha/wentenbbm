import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wenten BBM",
    short_name: "Wenten BBM",
    description: "Semeton bantu semeton cek BBM Bali",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F8F8",
    theme_color: "#2563eb",
    lang: "id",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
