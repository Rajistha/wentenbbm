"use client";
import { radiusLabel } from "@/lib/geofence";
import { decodePlace, distanceM, formatDistance, type Locale, type RpcErrorCode } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { callRpc, RpcError } from "@/lib/backend/client";
import { useApp } from "@/lib/store";
import { BottomSheet } from "../common/BottomSheet";
import { Icon } from "../common/Icon";
import { mapApi } from "../map/mapApi";

const MIN_DISTANCE_M = 50;

/**
 * Langkah 1: pilih titik. Penanda tetap di tengah layar, pengguna menggeser peta
 * sampai tepat di Pertamini atau Pertashop.
 */
export function AddPlacePicker() {
  const t = useTranslations("add");
  const places = useApp((s) => s.places);
  const [err, setErr] = useState<string | null>(null);
  const { setAddPoint, setAddMode, endAdd } = useApp.getState();

  useEffect(() => {
    const map = mapApi.current;
    const u = useApp.getState().user;
    if (!map) return;
    if (useApp.getState().addPoint) {
      const p = useApp.getState().addPoint!;
      map.flyTo({ center: [p.lng, p.lat], zoom: 17.5 });
    } else if (u) map.flyTo({ center: [u.lng, u.lat], zoom: Math.max(map.getZoom(), 17) });
    else if (map.getZoom() < 15) map.easeTo({ zoom: 15 });
  }, []);

  const next = () => {
    const c = mapApi.current?.getCenter();
    if (!c) return;
    const point = { lat: c.lat, lng: c.lng };
    // Cek dini di klien; server tetap memeriksa ulang
    for (const p of places) {
      const d = distanceM(point, p);
      if (d <= MIN_DISTANCE_M) return setErr(t("exists", { name: p.name, d: Math.round(d) }));
    }
    setErr(null);
    setAddPoint(point);
    setAddMode("form");
  };

  return (
    <>
      <div className="add-top float-card" role="status">
        <strong>{t("pickTitle")}</strong>
        <span className="caption muted">{t("pickHint")}</span>
      </div>
      <div className="add-pin" aria-hidden="true">
        <Icon name="pin" size={44} strokeWidth={2.2} />
        <span className="add-pin-dot" />
      </div>
      <div className="add-bottom">
        {err && (
          <div className="form-error float-card" role="alert">
            {err}
          </div>
        )}
        <div className="wz-pair">
          <button type="button" className="btn btn-lg" onClick={endAdd}>
            {t("cancel")}
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={next}>
            {t("next")}
          </button>
        </div>
      </div>
    </>
  );
}

type Kind = "retailer" | "pertashop";

/** Langkah 2: jenis, nama, BBM yang dijual, dan patokan. */
export function AddPlaceSheet() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const point = useApp((s) => s.addPoint);
  const fuelTypes = useApp((s) => s.fuelTypes);
  const { setAddMode, endAdd, addPlaceLocal, select, showToast } = useApp.getState();

  const [kind, setKind] = useState<Kind>("retailer");
  const [name, setName] = useState("");
  const [fuels, setFuels] = useState<number[]>([1]);
  const [landmark, setLandmark] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!point) return null;
  const pertamina = fuelTypes.filter((f) => f.brand === "pertamina");

  const submit = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await callRpc("suggest_place", {
        p_kind: kind,
        p_name: name.trim() || null,
        p_address: landmark.trim() || null,
        p_lat: point.lat,
        p_lng: point.lng,
        p_fuels: fuels,
      });
      if (!res.ok) {
        setError(
          t(`errors.${res.code}`, { m: radiusLabel(),
            name: res.near_name ?? "",
            d: res.distance_m != null ? formatDistance(res.distance_m, locale) : "",
          }),
        );
        return;
      }
      const place = decodePlace(res.place);
      const pending = res.status === "quarantined";
      addPlaceLocal(place, pending);
      showToast(pending ? t("add.pending") : t("add.added"));
      endAdd();
      select(place.id, { fly: true, open: !window.matchMedia("(min-width: 1024px)").matches });
    } catch (err) {
      const code: RpcErrorCode = err instanceof RpcError ? err.code : "NETWORK";
      setError(t(`errors.${code}`, { m: radiusLabel(), name: "", d: "" }));
    } finally {
      setSending(false);
    }
  };

  const header = (
    <div className="wz-head">
      <div className="wz-top">
        <button type="button" className="wz-icon" aria-label={t("detail.back")} onClick={() => setAddMode("pick")}>
          <Icon name="back" size={20} />
        </button>
        <div className="wz-step">{t("add.title")}</div>
        <button type="button" className="wz-icon" aria-label={t("detail.close")} onClick={endAdd}>
          <Icon name="close" size={20} />
        </button>
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
      <button type="button" className="btn btn-primary btn-lg btn-block" disabled={sending || !fuels.length} onClick={submit}>
        {sending ? t("add.sending") : t("add.submit")}
      </button>
    </>
  );

  return (
    <BottomSheet label={t("add.title")} header={header} footer={footer} onClose={endAdd} initial="full" scrim>
      <h2 className="wz-title">{t("add.formTitle")}</h2>
      <p className="verified" style={{ margin: "8px 0 16px" }}>
        <Icon name="pin" size={14} /> {t("add.location")}: {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        <button type="button" className="link-btn" style={{ marginLeft: 8 }} onClick={() => setAddMode("pick")}>
          {t("add.change")}
        </button>
      </p>

      <fieldset className="form-group" style={{ border: 0, padding: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>
          {t("add.kind")}
        </legend>
        <div className="segmented" role="radiogroup" aria-label={t("add.kind")}>
          {(["retailer", "pertashop"] as Kind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
              {t(`add.kind_${k}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="form-group">
        <label className="label" htmlFor="add-name">
          {t("add.name")}
        </label>
        <input id="add-name" className="text-input" maxLength={60} value={name} placeholder={t("add.namePh")} onChange={(e) => setName(e.target.value)} />
      </div>

      <fieldset className="form-group" style={{ border: 0, padding: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>
          {t("add.fuels")}
        </legend>
        <div className="chip-wrap">
          {pertamina.map((f) => {
            const on = fuels.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() => setFuels((s) => (on ? s.filter((x) => x !== f.id) : [...s, f.id]))}
              >
                {on && <Icon name="check" size={14} />} {f.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="form-group">
        <label className="label" htmlFor="add-landmark" style={{ display: "flex", justifyContent: "space-between" }}>
          {t("add.landmark")}
          <span className="caption muted tnum">{landmark.length}/120</span>
        </label>
        <textarea
          id="add-landmark"
          className="textarea"
          maxLength={120}
          value={landmark}
          placeholder={t("add.landmarkPh")}
          onChange={(e) => setLandmark(e.target.value)}
        />
      </div>
      <p className="caption muted">{t("add.hint")}</p>
    </BottomSheet>
  );
}
