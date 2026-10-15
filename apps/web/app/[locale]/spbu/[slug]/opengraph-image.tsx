import { REGIONS } from "@wenten/core";
import { ImageResponse } from "next/og";
import { getPlaceBySlug } from "@/lib/backend/server";

export const alt = "SPBU";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LABEL = {
  id: { available: "Tersedia", limited: "Terbatas", empty: "Habis", unknown: "Belum ada laporan", note: "Laporan warga, bukan data resmi" },
  en: { available: "Available", limited: "Limited", empty: "Out of stock", unknown: "No reports yet", note: "Community report, not official data" },
} as const;
const COLOR = { available: "#16a34a", limited: "#f59e0b", empty: "#e11d48", unknown: "#64748b" } as const;

/** Pratinjau per SPBU: nama dan status terkini saat tautan dibagikan. */
export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const l = locale === "en" ? "en" : "id";
  const found = await getPlaceBySlug(slug).catch(() => null);
  const name = found?.place.name ?? "Wenten BBM";
  const region = REGIONS.find((r) => r.id === found?.place.regionId)?.name ?? "Bali";
  const overall = found?.status?.overall ?? "unknown";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          color: "#0f172a",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>
          Wenten<span style={{ color: "#2563eb", marginLeft: 10, fontWeight: 500 }}>BBM</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 80, fontWeight: 800, lineHeight: 1.1, letterSpacing: -2 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 36, color: "#475569", marginTop: 12 }}>
            {[found?.place.address, region].filter(Boolean).join(" · ")}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: COLOR[overall], marginRight: 20, display: "flex" }} />
            <div style={{ display: "flex", fontSize: 56, fontWeight: 700 }}>{LABEL[l][overall]}</div>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#64748b" }}>{LABEL[l].note}</div>
      </div>
    ),
    size,
  );
}
