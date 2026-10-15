"use client";
import { Icon } from "@/features/common/Icon";
import { distanceM } from "@wenten/core";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { GEOFENCE_M, MAX_ACCURACY_M } from "@/lib/env";
import { startLocation } from "@/lib/geolocation";
import { useApp } from "@/lib/store";

/** Ajakan kontekstual saat pengguna terdeteksi di SPBU (US-05) dan penjelasan izin lokasi (US-01). */
export function NearbyPrompt() {
  const t = useTranslations();
  const user = useApp((s) => s.user);
  const places = useApp((s) => s.places);
  const readOnly = useApp((s) => s.readOnly);
  const selectedId = useApp((s) => s.selectedId);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const near = useMemo(() => {
    if (!user || user.accuracy > MAX_ACCURACY_M) return null;
    let best: { id: string; name: string; d: number } | null = null;
    for (const p of places) {
      if (p.kind === "terminal") continue;
      const d = distanceM(user, p);
      if (d <= GEOFENCE_M && (!best || d < best.d)) best = { id: p.id, name: p.name, d };
    }
    return best;
  }, [user, places]);

  if (readOnly || !near || near.id === dismissed || near.id === selectedId) return null;
  return (
    <div className="float-card nearby" role="region" aria-label={t("nearby.prompt", { name: near.name })}>
      <span>{t("nearby.prompt", { name: near.name })}</span>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          useApp.getState().select(near.id, { open: true, fly: true });
          useApp.getState().openPanel("report");
        }}
      >
        <Icon name="edit" /> {t("nearby.action")}
      </button>
      <button type="button" className="btn btn-icon btn-ghost" style={{ width: 36, minHeight: 36 }} aria-label={t("nearby.dismiss")} onClick={() => setDismissed(near.id)}>
        <Icon name="close" />
      </button>
    </div>
  );
}

/** Kartu penjelasan izin lokasi (US-01) dan pesan saat izin ditolak (DESIGN.md 8). */
export function LocationCard() {
  const t = useTranslations("location");
  const geoState = useApp((s) => s.geoState);
  const user = useApp((s) => s.user);
  const [hidden, setHidden] = useState(false);
  const { openPanel } = useApp.getState();

  if (hidden || user) return null;
  if (geoState === "prompt") {
    return (
      <div className="float-card banner" role="region" aria-label={t("promptTitle")}>
        <Icon name="locate" />
        <div className="grow">
          <strong>{t("promptTitle")}</strong>
          <div className="caption muted">{t("promptBody")}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => startLocation()}>
              {t("allow")}
            </button>
            <button type="button" className="btn" onClick={() => setHidden(true)}>
              {t("later")}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (geoState === "denied" || geoState === "unavailable") {
    return (
      <div className="float-card banner" role="status">
        <Icon name="locate" />
        <div className="grow">
          {t("denied")}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={() => openPanel("list", { focusSearch: true })}>
              <Icon name="search" /> {t("searchRegion")}
            </button>
          </div>
        </div>
        <button type="button" className="btn btn-icon btn-ghost" style={{ width: 36, minHeight: 36 }} aria-label="Tutup" onClick={() => setHidden(true)}>
          <Icon name="close" />
        </button>
      </div>
    );
  }
  return null;
}
