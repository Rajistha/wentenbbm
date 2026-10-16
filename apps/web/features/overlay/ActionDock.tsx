"use client";
import { Icon } from "@/features/common/Icon";
import { distanceM, formatDistance, nearestWithFuel, type Locale } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { startLocation } from "@/lib/geolocation";
import { useApp } from "@/lib/store";
import { mapApi } from "../map/mapApi";
import { useShare } from "../stations/hooks";

/** Dock bawah: tombol utama "Terdekat yang ada BBM" + aksi sekunder (DESIGN.md 7.2). */
export function ActionDock() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const share = useShare();
  const user = useApp((s) => s.user);
  const geoState = useApp((s) => s.geoState);
  const pending = useApp((s) => s.pendingNearest);
  const { openPanel, select, showToast, setPendingNearest } = useApp.getState();

  const runNearest = () => {
    const s = useApp.getState();
    if (!s.user) return false;
    const r = nearestWithFuel(s.user, s.places, s.statuses, s.fuelFilter);
    if (!r) {
      showToast(t("nearest.none"));
      return true;
    }
    if (r.fellBackToLimited) showToast(t("nearest.fallbackLimited"));
    else if (r.distanceM > 15000) showToast(t("nearest.far", { d: formatDistance(r.distanceM, locale) }));
    select(r.place.id, { fly: true, open: !window.matchMedia("(min-width: 1024px)").matches, highlight: true });
    return true;
  };

  // Menunggu lokasi setelah pengguna menekan tombol tanpa izin (US-10)
  useEffect(() => {
    if (pending && user) {
      setPendingNearest(false);
      runNearest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, user]);

  const onNearest = () => {
    if (runNearest()) return;
    if (geoState === "denied" || geoState === "unavailable") {
      showToast(t("location.denied"));
      return;
    }
    setPendingNearest(true);
    showToast(t("nearest.needLocation"));
    startLocation();
  };

  return (
    <div className="dock">
      <div className="dock-main">
        <button type="button" className="btn btn-primary btn-lg" onClick={onNearest} aria-busy={pending}>
          <Icon name="locate" /> {t("dock.nearest")}
        </button>
        <button type="button" className="btn btn-lg dock-list" onClick={() => openPanel("list")} aria-label={t("dock.list")}>
          <Icon name="list" size={20} /> {t("dock.list")}
        </button>
      </div>
      <div className="dock-secondary">
        <button type="button" className="btn" onClick={() => openPanel("list")}>
          <Icon name="list" /> {t("dock.list")}
        </button>
        <button type="button" className="btn" onClick={() => openPanel("layers")}>
          <Icon name="layers" /> {t("dock.layers")}
        </button>
        <button type="button" className="btn" onClick={() => useApp.getState().startAdd()}>
          <Icon name="plus" /> {t("dock.add")}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => share("/", t("share.text"))}
        >
          <Icon name="share" /> {t("dock.share")}
        </button>
      </div>
    </div>
  );
}

/** Tombol mengambang: lokasi saya dan zoom (zoom hanya di desktop). */
export function MapFabs({ bottom }: { bottom?: number }) {
  const t = useTranslations("dock");
  const user = useApp((s) => s.user);
  const geoState = useApp((s) => s.geoState);

  return (
    <div className={`map-fabs${bottom == null ? " fabs-inline" : ""}`} style={bottom == null ? undefined : { bottom }}>
      <div className="zoom-btns">
        <button type="button" className="btn btn-icon" aria-label={t("zoomIn")} onClick={() => mapApi.current?.zoomIn()}>
          <Icon name="plus" />
        </button>
        <button type="button" className="btn btn-icon" aria-label={t("zoomOut")} onClick={() => mapApi.current?.zoomOut()}>
          <Icon name="minus" />
        </button>
      </div>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={t("myLocation")}
        onClick={() => {
          if (user) mapApi.current?.flyTo({ center: [user.lng, user.lat], zoom: Math.max(mapApi.current.getZoom(), 14) });
          else if (geoState !== "denied") startLocation();
        }}
      >
        <Icon name="locate" />
      </button>
    </div>
  );
}
