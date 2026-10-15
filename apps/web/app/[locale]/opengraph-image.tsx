import { ImageResponse } from "next/og";

export const alt = "Wenten BBM";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Gambar pratinjau saat tautan dibagikan (WhatsApp, Facebook, X, dll.). */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
          color: "#0f172a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 112,
              height: 112,
              borderRadius: 32,
              background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="64" height="64" viewBox="0 0 32 32">
              <path d="M16 5.6c-.4.5-7 7.9-7 12.3a7 7 0 0 0 14 0c0-4.4-6.6-11.8-7-12.3Z" fill="#fff" />
              <circle cx="16" cy="17.9" r="2.7" fill="#2563eb" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 800, letterSpacing: -2 }}>
            Wenten<span style={{ color: "#2563eb", marginLeft: 16, fontWeight: 500 }}>BBM</span>
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 52, fontWeight: 700, marginTop: 56, lineHeight: 1.2 }}>
          {en ? "Which Bali petrol stations still have fuel?" : "SPBU mana di Bali yang masih ada BBM?"}
        </div>
        <div style={{ display: "flex", fontSize: 32, marginTop: 24, color: "#475569" }}>
          {en ? "Live map from reports by people on site" : "Peta langsung dari laporan warga di lokasi"}
        </div>
      </div>
    ),
    size,
  );
}
