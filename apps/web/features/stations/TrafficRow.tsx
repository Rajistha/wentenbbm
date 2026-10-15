"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Icon } from "../common/Icon";

interface Traffic {
  level: "free" | "moderate" | "heavy" | "closed" | "unknown";
  currentSpeed: number | null;
  freeFlowSpeed: number | null;
  reason?: string;
}

const PILL = { free: "pill-available", moderate: "pill-limited", heavy: "pill-empty", closed: "pill-empty", unknown: "pill-unknown" } as const;

/**
 * Kondisi lalu lintas di depan SPBU (TomTom). Hanya sinyal pelengkap: jalan padat belum tentu
 * antrean BBM, dan jalan lancar belum tentu stok ada. Disembunyikan bila tidak ada data.
 */
export function TrafficRow({ slug }: { slug: string }) {
  const t = useTranslations("traffic");
  const { data } = useQuery({
    queryKey: ["traffic", slug],
    staleTime: 10 * 60_000,
    retry: 0,
    queryFn: async (): Promise<Traffic> => {
      const res = await fetch(`/api/traffic/${slug}`);
      return res.json();
    },
  });
  // Tanpa kunci API, kuota habis, atau data tidak meyakinkan: jangan tampilkan apa pun
  if (!data || data.level === "unknown") return null;

  const note = data.level === "moderate" || data.level === "heavy" ? t("note") : null;
  return (
    <div className="traffic-row">
      <div className="traffic-head">
        <span className="traffic-title">
          <Icon name="car" size={16} /> {t("title")}
        </span>
        <span className={`pill ${PILL[data.level]}`}>{t(data.level)}</span>
      </div>
      {data.currentSpeed != null && data.freeFlowSpeed != null && data.level !== "closed" && (
        <div className="caption muted">{t("speed", { c: data.currentSpeed, f: data.freeFlowSpeed })}</div>
      )}
      {note && <div className="caption muted">{note}</div>}
      <div className="caption muted traffic-credit">
        © <a href="https://www.tomtom.com/" target="_blank" rel="noopener noreferrer">TomTom</a>
      </div>
    </div>
  );
}
