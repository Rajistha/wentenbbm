"use client";
import { formatDistance, type Locale, type Place, type RpcErrorCode } from "@wenten/core";
import type { CorrectionKind } from "@wenten/db/rpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { callRpc, RpcError } from "@/lib/backend/client";
import { IS_DEMO } from "@/lib/env";
import { useApp } from "@/lib/store";
import { Icon } from "../common/Icon";
import { Modal } from "../common/Modal";
import { rpcErrorText } from "../common/errors";
import { useGeofence } from "./hooks";

const pricesKey = (id: string) => ["station-prices", id] as const;

/** Harga median per jenis BBM dari laporan warga 7 hari terakhir: Map<fuelTypeId, rupiah>. */
export function useStationPrices(stationId: string | null) {
  return useQuery({
    queryKey: pricesKey(stationId ?? ""),
    enabled: !!stationId && !IS_DEMO,
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await callRpc("station_prices", { p_station_id: stationId! });
      return new Map<number, { price: number; n: number }>((rows ?? []).map(([f, price, n]) => [f, { price, n }]));
    },
  });
}

export const formatRupiah = (n: number, locale: Locale) =>
  `Rp ${new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US").format(n)}`;

/** Baris tombol kecil di bawah tabel BBM: isi harga dan usulkan koreksi. */
export function StationActions({ place }: { place: Place }) {
  const t = useTranslations();
  const geo = useGeofence(place);
  const readOnly = useApp((s) => s.readOnly);
  const [modal, setModal] = useState<"price" | "fix" | null>(null);
  if (IS_DEMO || place.kind === "terminal") return null;

  const needNear = () => {
    const { showToast } = useApp.getState();
    if (readOnly) return showToast(t("banners.readOnly"));
    showToast(geo.reason === "low_accuracy" ? t("location.lowAccuracy") : t("detail.reportNeedNear"));
  };
  const gated = (fn: () => void) => () => (geo.ok && !readOnly ? fn() : needNear());

  return (
    <>
      <div className="station-actions">
        <button type="button" className="chip" onClick={gated(() => setModal("price"))}>
          <Icon name="tag" size={14} /> {t("more.priceAction")}
        </button>
        <button type="button" className="chip" onClick={() => setModal("fix")}>
          <Icon name="flag" size={14} /> {t("more.fixAction")}
        </button>
      </div>
      {modal === "price" && <PriceModal place={place} onClose={() => setModal(null)} />}
      {modal === "fix" && <CorrectionModal place={place} onClose={() => setModal(null)} />}
    </>
  );
}

function PriceModal({ place, onClose }: { place: Place; onClose(): void }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const fuelTypes = useApp((s) => s.fuelTypes);
  const geo = useGeofence(place);
  const fuels = fuelTypes.filter((f) => place.fuelIds.includes(f.id));
  const [values, setValues] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = Object.entries(values)
    .map(([id, v]) => [Number(id), Number(v.replace(/\D/g, ""))] as const)
    .filter(([, n]) => n > 0);

  const send = async () => {
    if (!geo.user || !entries.length) return;
    if (entries.some(([, n]) => n < 3000 || n > 60000)) return setError(t("more.priceRange"));
    setBusy(true);
    setError(null);
    try {
      for (const [fuel, price] of entries) {
        const res = await callRpc("submit_price", {
          p_station_id: place.id,
          p_fuel_type_id: fuel,
          p_price: price,
          p_lat: geo.user.lat,
          p_lng: geo.user.lng,
          p_accuracy_m: Math.round(geo.user.accuracy),
        });
        if (!res.ok) {
          // Sudah mengirim harga yang sama dalam 6 jam: lanjutkan ke yang lain tanpa menganggapnya gagal
          if (res.code === "RATE_LIMIT_STATION") continue;
          setError(rpcErrorText(t, res.code));
          return;
        }
      }
      await qc.invalidateQueries({ queryKey: pricesKey(place.id) });
      useApp.getState().showToast(t("more.priceThanks"));
      onClose();
    } catch (err) {
      const code: RpcErrorCode = err instanceof RpcError ? err.code : "NETWORK";
      setError(rpcErrorText(t, code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("more.priceTitle")} sub={place.name} onClose={onClose}>
      <p className="caption muted" style={{ margin: "12px 0" }}>
        {t("more.priceBody")}
      </p>
      <div className="price-fields">
        {fuels.map((f) => (
          <label key={f.id} className="price-field">
            <span>{f.name}</span>
            <span className="price-input">
              <span aria-hidden="true">Rp</span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="0"
                value={values[f.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
              />
            </span>
          </label>
        ))}
      </div>
      {error && <div className="form-error">{error}</div>}
      <button type="button" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }} disabled={busy || !entries.length} onClick={send}>
        {busy ? t("report.sending") : t("more.priceSend")}
      </button>
    </Modal>
  );
}

const KINDS: CorrectionKind[] = ["wrong_location", "closed", "wrong_fuels", "duplicate", "other"];

function CorrectionModal({ place, onClose }: { place: Place; onClose(): void }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const geo = useGeofence(place);
  const [kind, setKind] = useState<CorrectionKind>("wrong_location");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsLocation = kind === "wrong_location";
  const canLocate = !!geo.user && geo.user.accuracy <= 100;

  const send = async () => {
    setError(null);
    if (kind === "other" && !note.trim()) return setError(t("more.fixNeedNote"));
    if (needsLocation && !canLocate) return setError(t("more.fixNeedLocation"));
    setBusy(true);
    try {
      const res = await callRpc("suggest_correction", {
        p_station_id: place.id,
        p_kind: kind,
        p_lat: needsLocation ? geo.user!.lat : null,
        p_lng: needsLocation ? geo.user!.lng : null,
        p_note: note.trim() || null,
      });
      if (!res.ok) {
        setError(rpcErrorText(t, res.code, res.distance_m != null ? formatDistance(res.distance_m, locale) : ""));
        return;
      }
      useApp.getState().showToast(t("more.fixThanks"));
      onClose();
    } catch (err) {
      setError(rpcErrorText(t, err instanceof RpcError ? err.code : "NETWORK"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("more.fixTitle")} sub={place.name} onClose={onClose}>
      <div className="fix-kinds" role="radiogroup" aria-label={t("more.fixTitle")} style={{ marginTop: 12 }}>
        {KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className="chip-select" onClick={() => setKind(k)}>
            {t(`more.fix_${k}`)}
          </button>
        ))}
      </div>
      {needsLocation && <p className="caption muted">{canLocate ? t("more.fixLocationHint") : t("more.fixNeedLocation")}</p>}
      <textarea
        className="fix-note"
        rows={2}
        maxLength={280}
        value={note}
        placeholder={t("more.fixNote")}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <div className="form-error">{error}</div>}
      <button type="button" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={send}>
        {busy ? t("report.sending") : t("more.fixSend")}
      </button>
    </Modal>
  );
}
