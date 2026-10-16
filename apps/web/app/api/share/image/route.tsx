import { ImageResponse } from "next/og";
import { decodePlace, decodeStationStatus, projectBali, summarizeFuel, type FuelSummary, type Place, type StationStatus } from "@wenten/core";
import { getPlacesPayload, getStatusPayload } from "@/lib/backend/server";
import { SITE_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

type Format = "story" | "post" | "message";
const SIZES: Record<Format, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1080 },
  message: { width: 1200, height: 630 },
};

const C = {
  bg: "#f7f5f0",
  ink: "#0f172a",
  muted: "#64748b",
  green: "#16a34a",
  amber: "#f59e0b",
  red: "#e11d48",
  gray: "#b6bcc6",
  blob: "#e8e5dc",
  dark: "#111827",
};

const TEXT = {
  id: {
    kicker: (t: string) => `KONDISI BBM DI BALI SAAT INI · ${t} WITA`,
    have: "ada BBM",
    none1: "Belum ada laporan",
    none2: "hari ini",
    noneSub: "Jadilah yang pertama melapor.",
    available: "Tersedia",
    limited: "Terbatas",
    empty: "Habis",
    unknown: "Belum ada kabar",
    reports: (n: number) => `${n.toLocaleString("id-ID")} laporan warga dalam 24 jam`,
    live: "Laporan warga langsung",
    area: "PER WILAYAH",
    foot: "Laporan warga langsung. Cek sebelum berangkat, lalu bantu laporkan.",
    stations: (n: number, t: number) => `${n} dari ${t} SPBU`,
  },
  en: {
    kicker: (t: string) => `FUEL IN BALI RIGHT NOW · ${t} WITA`,
    have: "have fuel",
    none1: "No reports yet",
    none2: "today",
    noneSub: "Be the first to report.",
    available: "Available",
    limited: "Limited",
    empty: "Sold out",
    unknown: "No news",
    reports: (n: number) => `${n.toLocaleString("en-US")} resident reports in 24 h`,
    live: "Live reports from residents",
    area: "BY AREA",
    foot: "Live reports from residents. Check before you go, then help report.",
    stations: (n: number, t: number) => `${n} of ${t} stations`,
  },
} as const;

type Dict = (typeof TEXT)["id"] | (typeof TEXT)["en"];

function Mark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", width: size, height: size, borderRadius: size * 0.28, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", alignItems: "center", justifyContent: "center" }}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 32 32">
        <path d="M16 5.6c-.4.5-7 7.9-7 12.3a7 7 0 0 0 14 0c0-4.4-6.6-11.8-7-12.3Z" fill="#fff" />
        <circle cx="16" cy="17.9" r="2.7" fill="#2563eb" />
      </svg>
    </div>
  );
}

function Brand({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
      <Mark size={size} />
      <div style={{ display: "flex", fontSize: size * 0.62, fontWeight: 800, color: C.ink, letterSpacing: -1 }}>
        Wenten<span style={{ color: "#2563eb", marginLeft: 8, fontWeight: 500 }}>BBM</span>
      </div>
    </div>
  );
}

/** Peta titik SPBU: gumpalan abu-abu sebagai latar pulau, lalu titik berwarna menurut status. */
function DotMap({ places, statuses, w, h, dot }: { places: Place[]; statuses: Map<string, StationStatus>; w: number; h: number; dot: number }) {
  // Pulau Bali berbanding kira-kira 3:2, muat ke kotak w x h di tengah
  const aspect = 1.5;
  const mw = w / h > aspect ? h * aspect : w;
  const mh = mw / aspect;
  const ox = (w - mw) / 2;
  const oy = (h - mh) / 2;
  const order = { unknown: 0, empty: 1, limited: 2, available: 3 } as const;
  const color = { unknown: C.gray, empty: C.red, limited: C.amber, available: C.green } as const;
  const pts = places
    .filter((p) => p.kind === "spbu")
    .map((p) => {
      const s = statuses.get(p.id)?.overall ?? "unknown";
      const { x, y } = projectBali(p.lat, p.lng);
      return { id: p.id, s, x: ox + x * mw, y: oy + y * mh };
    })
    .sort((a, b) => order[a.s] - order[b.s]);
  const blob = dot * 4.2;
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h }}>
      {pts.map((p) => (
        <div key={`b${p.id}`} style={{ position: "absolute", left: p.x - blob / 2, top: p.y - blob / 2, width: blob, height: blob, borderRadius: 9999, background: C.blob }} />
      ))}
      {pts.map((p) => (
        <div key={`d${p.id}`} style={{ position: "absolute", left: p.x - dot / 2, top: p.y - dot / 2, width: dot, height: dot, borderRadius: 9999, background: color[p.s], border: "2px solid #ffffff" }} />
      ))}
    </div>
  );
}

function Legend({ s, t, size, cols }: { s: FuelSummary; t: Dict; size: number; cols: number }) {
  const items: [string, string, number][] = [
    [C.green, t.available, s.available],
    [C.amber, t.limited, s.limited],
    [C.red, t.empty, s.empty],
    [C.gray, t.unknown, s.unknown],
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
      {items.map(([c, label, n]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: size * 0.4, width: `${100 / cols}%`, marginBottom: size * 0.5 }}>
          <div style={{ display: "flex", width: size * 0.7, height: size * 0.7, borderRadius: 9999, background: c }} />
          <div style={{ display: "flex", fontSize: size, color: C.ink }}>
            {label}
            <span style={{ marginLeft: 10, fontWeight: 700 }}>{n}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Headline({ s, t, size, center = false }: { s: FuelSummary; t: Dict; size: number; center?: boolean }) {
  const empty = s.reported === 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: center ? "center" : "flex-start", fontWeight: 800, letterSpacing: -2, lineHeight: 1.08 }}>
      <div style={{ display: "flex", fontSize: size, color: C.green }}>{empty ? t.none1 : t.stations(s.withFuel, s.total)}</div>
      <div style={{ display: "flex", fontSize: size, color: C.ink }}>{empty ? t.none2 : t.have}</div>
    </div>
  );
}

function Areas({ s, t }: { s: FuelSummary; t: Dict }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: C.muted, letterSpacing: 2, marginBottom: 14 }}>{t.area}</div>
      {s.areas.map((a) => (
        <div key={a.regionId} style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", width: 190, fontSize: 30, color: C.ink }}>{a.name}</div>
          <div style={{ display: "flex", flex: 1, height: 22, borderRadius: 11, overflow: "hidden", background: C.blob }}>
            {a.available > 0 && <div style={{ display: "flex", flex: a.available, background: C.green }} />}
            {a.limited > 0 && <div style={{ display: "flex", flex: a.limited, background: C.amber }} />}
            {a.empty > 0 && <div style={{ display: "flex", flex: a.empty, background: C.red }} />}
            {a.unknown > 0 && <div style={{ display: "flex", flex: a.unknown, background: C.gray }} />}
          </div>
          <div style={{ display: "flex", width: 110, justifyContent: "flex-end", fontSize: 30, fontWeight: 800, color: C.ink }}>
            {a.available + a.limited}/{a.total}
          </div>
        </div>
      ))}
    </div>
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const f = (["story", "post", "message"].includes(url.searchParams.get("f") ?? "") ? url.searchParams.get("f") : "story") as Format;
  const lang = url.searchParams.get("lang") === "en" ? "en" : "id";
  const t: Dict = TEXT[lang];

  let places: Place[] = [];
  let statuses = new Map<string, StationStatus>();
  let reports24 = 0;
  try {
    const [pp, ss] = await Promise.all([getPlacesPayload(), getStatusPayload()]);
    places = pp.places.map(decodePlace);
    statuses = new Map(ss.stations.map((x) => [x[0], decodeStationStatus(x)]));
    reports24 = ss.reports_24h ?? 0;
  } catch (err) {
    console.error(err);
  }
  const s = summarizeFuel(places, statuses, 4);
  const now = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(":", ".");
  const host = SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const { width, height } = SIZES[f];
  const sub = s.reported === 0 ? t.noneSub : reports24 > 0 ? t.reports(reports24) : t.live;

  let body: React.ReactElement;
  if (f === "story") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", width, height, background: C.bg }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "64px 56px 0" }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Brand size={72} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 44, fontSize: 25, fontWeight: 700, color: C.muted, letterSpacing: 1.5 }}>{t.kicker(now)}</div>
          <div style={{ display: "flex", justifyContent: "center", textAlign: "center", marginTop: 20 }}>
            <Headline s={s} t={t} size={92} center />
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
            <DotMap places={places} statuses={statuses} w={968} h={650} dot={18} />
          </div>
          <div style={{ display: "flex", marginTop: 28 }}>
            <Legend s={s} t={t} size={28} cols={2} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", fontSize: 30, fontWeight: 700, color: C.green, marginBottom: 30 }}>{sub}</div>
          {s.areas.length > 0 && <Areas s={s} t={t} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: C.dark, padding: "30px 56px 36px" }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 800, color: "#ffffff" }}>{host}</div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 24, color: "#cbd5e1", textAlign: "center" }}>{t.foot}</div>
        </div>
      </div>
    );
  } else if (f === "post") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", width, height, background: C.bg, padding: "44px 48px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Brand size={56} />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: C.green }}>{host}</div>
        </div>
        <div style={{ display: "flex", marginTop: 30, fontSize: 24, fontWeight: 700, color: C.muted, letterSpacing: 1.5 }}>{t.kicker(now)}</div>
        <div style={{ display: "flex", marginTop: 12 }}>
          <Headline s={s} t={t} size={78} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
          <DotMap places={places} statuses={statuses} w={984} h={620} dot={16} />
        </div>
        <div style={{ display: "flex", marginTop: "auto" }}>
          <Legend s={s} t={t} size={24} cols={4} />
        </div>
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", width, height, background: C.bg }}>
        <div style={{ display: "flex", flex: 1, padding: "36px 48px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 560 }}>
            <Brand size={52} />
            <div style={{ display: "flex", marginTop: 28, fontSize: 20, fontWeight: 700, color: C.muted, letterSpacing: 1.2 }}>{t.kicker(now)}</div>
            <div style={{ display: "flex", marginTop: 10 }}>
              <Headline s={s} t={t} size={62} />
            </div>
            <div style={{ display: "flex", marginTop: 22 }}>
              <Legend s={s} t={t} size={22} cols={2} />
            </div>
          </div>
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
            <DotMap places={places} statuses={statuses} w={560} h={440} dot={11} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.dark, padding: "0 48px", height: 78 }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#ffffff" }}>{host}</div>
          <div style={{ display: "flex", fontSize: 22, color: "#cbd5e1" }}>{sub}</div>
        </div>
      </div>
    );
  }

  return new ImageResponse(body, {
    width,
    height,
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
