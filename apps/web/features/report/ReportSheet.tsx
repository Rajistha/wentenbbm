"use client";
import { formatDistance, type FuelAvailability, type Locale, type QueueLevel, type RpcErrorCode } from "@wenten/core";
import type { SubmitReportArgs } from "@wenten/db/rpc";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { callRpc, RpcError } from "@/lib/backend/client";
import { startLocation } from "@/lib/geolocation";
import { queueOfflineReport } from "@/lib/offline-queue";
import { useApp } from "@/lib/store";
import { refreshStatus } from "@/lib/sync";
import { BottomSheet } from "../common/BottomSheet";
import { Icon } from "../common/Icon";
import { StatusGlyph } from "../common/StatusGlyph";
import { recentReportsKey } from "../stations/RecentReports";
import { geoHint, useGeofence } from "../stations/hooks";

type Step = "answer" | "fuels" | "queue" | "wait";
const QUEUES: QueueLevel[] = ["none", "short", "medium", "long"];
// Titik tengah rentang jawaban "Berapa lama Anda antre?" (menit)
const WAITS = [3, 10, 22, 45, 75];

const FUEL_COLOR: Record<string, string> = {
  pertalite: "#16a34a",
  pertamax: "#0369a1",
  pertamax_turbo: "#dc2626",
  pertamax_green: "#0d9488",
  biosolar: "#374151",
  dexlite: "#374151",
  pertamina_dex: "#374151",
};

/**
 * Lapor stok langkah demi langkah (US-05): satu pertanyaan per layar, opsi besar,
 * sebagian besar langkah maju otomatis setelah satu ketukan.
 * Laporan dikirim satu kali di akhir, atau kapan saja lewat "Kirim sekarang".
 */
export function ReportSheet() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const qc = useQueryClient();
  const place = useApp((s) => (s.selectedId ? s.placeById.get(s.selectedId) : undefined));
  const fuelTypes = useApp((s) => s.fuelTypes);
  const fuelFilter = useApp((s) => s.fuelFilter);
  const preset = useApp((s) => s.reportPreset);
  const { openPanel, showToast } = useApp.getState();
  const geo = useGeofence(place ?? null);

  const [chosen, setChosen] = useState<FuelAvailability | null>(null);
  const answer = preset ?? chosen;
  const [selected, setSelected] = useState<number[]>(() =>
    typeof fuelFilter === "number" && place?.fuelIds.includes(fuelFilter) ? [fuelFilter] : [],
  );
  const [queue, setQueue] = useState<QueueLevel | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  const [cur, setCur] = useState<Step>(preset ? (preset === "empty" ? "queue" : "fuels") : "answer");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Minta izin lokasi saat laporan dibuka bila belum ada (lokasi selalu wajib, juga saat syarat radius mati)
  useEffect(() => {
    const s = useApp.getState();
    if (!s.user && s.geoState !== "denied" && s.geoState !== "unavailable") startLocation();
  }, []);

  if (!place) return null;
  const fuels = fuelTypes.filter((f) => place.fuelIds.includes(f.id));

  const steps: Step[] = [
    ...(preset ? [] : (["answer"] as Step[])),
    ...(answer === "empty" ? [] : (["fuels"] as Step[])),
    "queue",
    "wait",
  ];
  const offset = preset ? 1 : 0;
  const idx = Math.max(0, steps.indexOf(cur));
  const total = steps.length + offset;

  const goBack = () => {
    setError(null);
    if (idx === 0) openPanel("detail");
    else setCur(steps[idx - 1]!);
  };
  const goNext = (from: Step = cur, list: Step[] = steps) => {
    setError(null);
    const i = list.indexOf(from);
    const next = list[i + 1];
    if (next) setCur(next);
  };

  const buildItems = (): SubmitReportArgs["p_items"] | null => {
    if (!answer) return null;
    if (answer === "empty") return fuels.map((f) => ({ fuel_type_id: f.id, availability: "empty" as const }));
    if (!selected.length) return null;
    return fuels.map((f) => ({
      fuel_type_id: f.id,
      availability: selected.includes(f.id) ? answer : ("empty" as const),
    }));
  };

  const submit = async (override?: { queue?: QueueLevel | null; wait?: number | null }) => {
    const items = buildItems();
    if (!items) {
      setError(answer ? t("report.needOne") : t("report.needAnswer"));
      return;
    }
    // Lokasi asli pengguna selalu wajib, juga saat syarat radius dimatikan (hanya batas jarak yang dilonggarkan)
    if (!geo.ok || !geo.user) return setError(geoHint(t, geo.reason));
    const q = override && "queue" in override ? override.queue ?? null : queue;
    const w = override && "wait" in override ? override.wait ?? null : wait;
    const args: SubmitReportArgs = {
      p_station_id: place.id,
      p_lat: geo.user.lat,
      p_lng: geo.user.lng,
      p_accuracy_m: Math.round(geo.user.accuracy),
      p_items: items,
      p_queue_level: q,
      p_wait_minutes: w == null ? null : WAITS[w]!,
      p_note: null,
    };
    setSending(true);
    setError(null);
    try {
      const res = await callRpc("submit_report", args);
      if (!res.ok) {
        setError(t(`errors.${res.code}`, { d: res.distance_m != null ? formatDistance(res.distance_m, locale) : "" }));
        return;
      }
      showToast(t("report.success"));
      await refreshStatus();
      await qc.invalidateQueries({ queryKey: recentReportsKey(place.id) });
      openPanel("detail");
    } catch (err) {
      const code: RpcErrorCode = err instanceof RpcError ? err.code : "NETWORK";
      if (code === "NETWORK" && !navigator.onLine) {
        await queueOfflineReport(args);
        showToast(t("report.queuedOffline"));
        openPanel("detail");
        return;
      }
      setError(t(`errors.${code}`, { d: "" }));
    } finally {
      setSending(false);
    }
  };

  const canSendNow = !!answer && (answer === "empty" || selected.length > 0);

  const header = (
    <div className="wz-head">
      <div className="wz-top">
        <button type="button" className="wz-icon" aria-label={t("detail.back")} onClick={goBack}>
          <Icon name="back" size={20} />
        </button>
        <div className="wz-step">{t("report.stepOf", { n: idx + 1 + offset, total })}</div>
        <button type="button" className="wz-icon" aria-label={t("detail.close")} onClick={() => openPanel("detail")}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={idx + 1 + offset}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < idx + 1 + offset ? "on" : ""} />
        ))}
      </div>
      <div className="wz-place">
        <Icon name="pin" size={14} /> <span>{place.name}</span>
      </div>
    </div>
  );

  const footer = (
    <>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {cur === "fuels" && (
        <>
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={!selected.length} onClick={() => goNext()}>
            {t("report.next")}
          </button>
          {canSendNow && (
            <div className="wz-secondary">
              <button type="button" className="wz-ghost" disabled={sending} onClick={() => submit()}>
                {sending ? t("report.sending") : t("report.sendNow")}
              </button>
            </div>
          )}
        </>
      )}
      {cur === "queue" && (
        <div className="wz-pair">
          <button
            type="button"
            className="btn btn-lg"
            disabled={sending}
            onClick={() => {
              setQueue(null);
              goNext();
            }}
          >
            {t("report.skip")}
          </button>
          <button type="button" className="btn btn-primary btn-lg" disabled={sending} onClick={() => submit()}>
            {sending ? t("report.sending") : t("report.send")}
          </button>
        </div>
      )}
      {cur === "wait" && (
        <button type="button" className="btn btn-primary btn-lg btn-block" disabled={sending} onClick={() => submit()}>
          {sending ? t("report.sending") : t("report.submit")}
        </button>
      )}
    </>
  );

  const pickAnswer = (a: FuelAvailability) => {
    setChosen(a);
    const list: Step[] = ["answer", ...(a === "empty" ? [] : (["fuels"] as Step[])), "queue"];
    goNext("answer", list);
  };

  const pickQueue = (q: QueueLevel) => {
    setQueue(q);
    if (q === "none") void submit({ queue: q, wait: null });
    else setCur("wait");
  };

  return (
    <BottomSheet label={t("report.title")} header={header} footer={footer} onClose={() => openPanel("detail")} initial="full" scrim>
      {geo.ok && geo.distance != null && (
        <p className="verified" style={{ margin: "4px 0 16px" }}>
          <Icon name="verified" size={14} /> {t("report.verified", { d: formatDistance(geo.distance, locale) })}
        </p>
      )}

      {cur === "answer" && (
        <section aria-labelledby="q">
          <h2 id="q" className="wz-title">
            {t("report.q_answer")}
          </h2>
          <div className="opt-list">
            {(["available", "limited", "empty"] as FuelAvailability[]).map((a) => (
              <button key={a} type="button" className="opt" onClick={() => pickAnswer(a)} aria-pressed={answer === a}>
                <StatusGlyph status={a} size={28} />
                <span>
                  <strong>{t(`report.opt_${a}`)}</strong>
                  <span className="caption muted" style={{ display: "block" }}>
                    {t(`report.opt_${a}_hint`)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {cur === "fuels" && (
        <section aria-labelledby="q">
          <h2 id="q" className="wz-title">
            {t("report.q_fuels")}
          </h2>
          <p className="caption muted" style={{ margin: "2px 0 12px" }}>
            {t("report.fuels_help")}
          </p>
          <div className="opt-list">
            {fuels.map((f) => {
              const on = selected.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`opt${on ? " on" : ""}`}
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => setSelected((s) => (on ? s.filter((x) => x !== f.id) : [...s, f.id]))}
                >
                  <span className={`check${on ? " on" : ""}`}>{on && <Icon name="check" size={16} />}</span>
                  <span className="fuel-dot" style={{ background: FUEL_COLOR[f.code] ?? "#374151" }} aria-hidden="true" />
                  <span className="opt-label">{f.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {cur === "queue" && (
        <section aria-labelledby="q">
          <h2 id="q" className="wz-title">
            {t("report.q_queue")}
          </h2>
          <div className="opt-list">
            {QUEUES.map((q) => (
              <button key={q} type="button" className="opt" onClick={() => pickQueue(q)} aria-pressed={queue === q}>
                <span className="queue-ico" aria-hidden="true">
                  {Array.from({ length: { none: 0, short: 1, medium: 2, long: 3 }[q] }, (_, i) => (
                    <Icon key={i} name="car" size={18} />
                  ))}
                  {q === "none" && <Icon name="check" size={18} />}
                </span>
                <span>
                  <strong>{t(`queue.${q}`)}</strong>
                  <span className="caption muted" style={{ display: "block" }}>
                    {t(`report.queue_${q}_hint`)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {cur === "wait" && (
        <section aria-labelledby="q">
          <h2 id="q" className="wz-title">
            {t("report.q_wait")}
          </h2>
          <p className="caption muted" style={{ margin: "2px 0 12px" }}>
            {t("report.wait_help")}
          </p>
          <div className="opt-grid">
            {WAITS.map((_, i) => (
              <button key={i} type="button" className="opt" aria-pressed={wait === i} onClick={() => setWait(wait === i ? null : i)}>
                <strong>{t(`report.wait_${i}` as "report.wait_0")}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
    </BottomSheet>
  );
}
