"use client";
import { formatDistance, type Locale, type Place } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { callRpc } from "@/lib/backend/client";
import { IS_DEMO } from "@/lib/env";
import { useQueue } from "@/lib/queue";
import { useApp } from "@/lib/store";
import { Icon } from "../common/Icon";
import { Modal } from "../common/Modal";
import { useNow } from "../common/RelativeTime";
import { rpcErrorText } from "../common/errors";
import { geoHint, useGeofence } from "../stations/hooks";

const PING_MS = 60_000;

/** Kartu pelacak antrean yang tampil selama pengguna mengantre: waktu berjalan dan tombol hasil. */
export function QueueBar() {
  const t = useTranslations();
  const session = useQueue((s) => s.session);
  const busy = useQueue((s) => s.busy);
  const place = useApp((s) => (session ? s.placeById.get(session.stationId) : undefined));
  const now = useNow();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => useQueue.getState().restore(), []);

  // Denyut lokasi tiap menit selama tab terlihat; server menutup sesi bila pengguna menjauh
  useEffect(() => {
    if (!session) return;
    const ping = () => {
      const app = useApp.getState();
      const station = app.placeById.get(session.stationId);
      // Syarat radius mati: tanpa lokasi, denyut memakai titik SPBU agar sesi tidak kedaluwarsa
      const user = app.user ?? (!app.geofenceOn && station ? station : null);
      if (document.hidden || !user) return;
      callRpc("queue_ping", { p_session_id: session.id, p_lat: user.lat, p_lng: user.lng })
        .then((r) => {
          if (r.ok && r.open === false) {
            useQueue.getState().drop();
            useApp.getState().showToast(t("more.queueEnded"));
          }
        })
        .catch(() => {});
    };
    const id = setInterval(ping, PING_MS);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [session, t]);

  if (!session) return null;
  const minutes = Math.max(0, Math.floor((now - session.startedAt) / 60_000));

  const finish = async (reason: "got_fuel" | "empty" | "left") => {
    setError(null);
    const res = await useQueue.getState().leave(reason);
    if (!res.ok) return setError(rpcErrorText(t, res.code));
    useApp.getState().showToast(t("more.queueDone", { min: res.waitMinutes }));
  };

  return (
    <div className="float-card queue-bar" role="status">
      <div className="queue-bar-top">
        <Icon name="timer" size={18} />
        <div className="grow">
          <strong>{t("more.queueRunning", { min: minutes })}</strong>
          <div className="caption muted">{place?.name}</div>
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="queue-bar-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => finish("got_fuel")}>
          {t("more.gotFuel")}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => finish("empty")}>
          {t("more.soldOut")}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => finish("left")}>
          {t("more.leftQueue")}
        </button>
      </div>
    </div>
  );
}

/** Tombol "Saya di antrean ini" di detail SPBU. Hanya untuk yang berada dalam radius geofence. */
export function QueueJoin({ place }: { place: Place }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const session = useQueue((s) => s.session);
  const busy = useQueue((s) => s.busy);
  const geo = useGeofence(place);
  const fuelTypes = useApp((s) => s.fuelTypes);
  const readOnly = useApp((s) => s.readOnly);
  const fuelFilter = useApp((s) => s.fuelFilter);
  const [open, setOpen] = useState(false);
  const fuels = fuelTypes.filter((f) => place.fuelIds.includes(f.id));
  const [fuelId, setFuelId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (IS_DEMO || place.kind === "terminal" || session) return null;
  const canJoin = geo.ok && !readOnly;
  const defaultFuel = () => (typeof fuelFilter === "number" && place.fuelIds.includes(fuelFilter) ? fuelFilter : fuels[0]?.id ?? null);

  const start = async () => {
    setError(null);
    const res = await useQueue.getState().join(place, fuelId ?? defaultFuel());
    if (!res.ok) return setError(rpcErrorText(t, res.code, res.distance_m != null ? formatDistance(res.distance_m, locale) : ""));
    setOpen(false);
    useApp.getState().showToast(t("more.queueStarted"));
  };

  return (
    <>
      <button
        type="button"
        className={`btn btn-block${canJoin ? "" : " off"}`}
        aria-disabled={!canJoin}
        onClick={() => {
          if (!canJoin) return useApp.getState().showToast(readOnly ? t("banners.readOnly") : geoHint(t, geo.reason));
          setFuelId(defaultFuel());
          setOpen(true);
        }}
      >
        <Icon name="timer" size={18} /> {t("more.joinQueue")}
      </button>
      {open && (
        <Modal title={t("more.joinTitle")} sub={place.name} onClose={() => setOpen(false)}>
          <p className="caption muted" style={{ margin: "12px 0" }}>
            {t("more.joinBody")}
          </p>
          {fuels.length > 1 && (
            <div className="chip-row" role="radiogroup" aria-label={t("more.joinFuel")}>
              {fuels.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={fuelId === f.id} className="chip" onClick={() => setFuelId(f.id)}>
                  {f.name}
                </button>
              ))}
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          <button type="button" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={start}>
            {busy ? t("report.sending") : t("more.joinStart")}
          </button>
        </Modal>
      )}
    </>
  );
}
