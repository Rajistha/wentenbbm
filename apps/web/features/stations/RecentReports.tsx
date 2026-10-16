"use client";
import type { Place, RpcErrorCode, VoteType } from "@wenten/core";
import type { RawRecentReport } from "@wenten/db/rpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { callRpc, RpcError } from "@/lib/backend/client";
import { useApp } from "@/lib/store";
import { RelativeTime } from "../common/RelativeTime";
import { StatusGlyph } from "../common/StatusGlyph";
import { geoHint, useFuelName, useGeofence } from "./hooks";

export function recentReportsKey(stationId: string) {
  return ["recent-reports", stationId] as const;
}

/** Hingga 5 laporan terbaru dengan tombol Masih benar / Sudah tidak benar (US-06). */
export function RecentReports({ place }: { place: Place }) {
  const t = useTranslations();
  const fuelName = useFuelName();
  const qc = useQueryClient();
  const geo = useGeofence(place);
  const showToast = useApp((s) => s.showToast);
  const lastUpdate = useApp((s) => s.statuses.get(place.id)?.lastReportAt);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [...recentReportsKey(place.id), lastUpdate],
    queryFn: () => callRpc("station_recent_reports", { p_station_id: place.id, p_limit: 5 }),
    staleTime: 20_000,
  });

  const vote = async (r: RawRecentReport, v: VoteType) => {
    if (!geo.ok || !geo.user) {
      setError(geoHint(t, geo.reason, "vote"));
      return;
    }
    setBusy(r.id);
    setError(null);
    try {
      const res = await callRpc("cast_vote", {
        p_report_id: r.id,
        p_vote: v,
        p_lat: geo.user.lat,
        p_lng: geo.user.lng,
        p_accuracy_m: geo.user.accuracy,
      });
      if (res.ok) {
        showToast(t("detail.voted"));
        await qc.invalidateQueries({ queryKey: recentReportsKey(place.id) });
      } else {
        setError(t(`errors.${res.code}`, { d: res.distance_m ? `${res.distance_m} m` : "" }));
      }
    } catch (err) {
      setError(t(`errors.${(err instanceof RpcError ? err.code : "NETWORK") as RpcErrorCode}`, { d: "" }));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <p className="caption muted">…</p>;
  if (!data?.length) return <p className="caption muted">{t("detail.noRecent")}</p>;

  return (
    <div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {data.map((r) => {
        const canVote = !r.is_mine && !r.my_vote;
        return (
          <article key={r.id} className="report-card">
            <div className="caption muted" style={{ display: "flex", justifyContent: "space-between" }}>
              <RelativeTime at={r.created_at} />
              {r.is_mine && <span className="badge">{t("detail.mine")}</span>}
            </div>
            <div style={{ marginTop: 4 }}>
              {r.items.map((i, idx) => (
                <span key={i.fuel_type_id} className="status-inline" style={{ fontWeight: 500, marginRight: 8 }}>
                  <StatusGlyph status={i.availability} size={13} />
                  {fuelName(i.fuel_type_id)} {t(`status.short_${i.availability}`)}
                  {idx < r.items.length - 1 ? "," : ""}
                </span>
              ))}
              {r.queue && <span className="muted"> · {t("queue.list", { level: t(`queue.${r.queue}`).toLowerCase() })}</span>}
            </div>
            {r.note && <p className="note">“{r.note}”</p>}
            {!r.is_mine && (
              <div className="vote-row">
                <button
                  type="button"
                  className="btn"
                  disabled={!canVote || busy === r.id}
                  aria-pressed={r.my_vote === "confirm"}
                  title={!geo.ok ? geoHint(t, geo.reason, "vote") : undefined}
                  onClick={() => vote(r, "confirm")}
                >
                  {t("detail.stillTrue")} · <span className="tnum">{r.confirms}</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!canVote || busy === r.id}
                  aria-pressed={r.my_vote === "dispute"}
                  title={!geo.ok ? geoHint(t, geo.reason, "vote") : undefined}
                  onClick={() => vote(r, "dispute")}
                >
                  {t("detail.notTrue")} · <span className="tnum">{r.disputes}</span>
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
