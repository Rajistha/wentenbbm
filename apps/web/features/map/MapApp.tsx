"use client";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useFavoriteAlerts } from "@/lib/favorites";
import { useGeolocationBootstrap } from "@/lib/geolocation";
import { restorePrefs, useApp } from "@/lib/store";
import { useDataSync } from "@/lib/sync";
import { useRegisterVisit } from "@/lib/visit";
import { useIsDesktop } from "../common/useMedia";
import { ActionDock, MapFabs } from "../overlay/ActionDock";
import { AnnouncementBanner, SystemBanners, Toast } from "../overlay/Banners";
import { InfoMenu } from "../overlay/InfoMenu";
import { AddPlacePicker } from "../place/AddPlace";
import { MapLegend } from "../overlay/MapLegend";
import { LocationCard, NearbyPrompt } from "../overlay/NearbyPrompt";
import { StatusStrip } from "../overlay/StatusStrip";
import { ControlCard, IdentityCard } from "../overlay/TopCards";
import { QueueBar } from "../queue/QueueBar";
import { SearchBar } from "../search/SearchBar";

// Pecah bundel: peta (maplibre, ~800 KB), daftar, detail, lapor, cari, dan modal bagikan dimuat saat diperlukan
const StationMap = dynamic(() => import("./StationMap").then((m) => m.StationMap), { ssr: false });
const StationList = dynamic(() => import("../stations/StationList").then((m) => m.StationList), { ssr: false });
const StationDetail = dynamic(() => import("../stations/StationDetail").then((m) => m.StationDetail), { ssr: false });
const ReportSheet = dynamic(() => import("../report/ReportSheet").then((m) => m.ReportSheet), { ssr: false });
const SearchPanel = dynamic(() => import("../search/SearchPanel").then((m) => m.SearchPanel), { ssr: false });
const LayerPanel = dynamic(() => import("../overlay/LayerPanel").then((m) => m.LayerPanel), { ssr: false });
const AddPlaceSheet = dynamic(() => import("../place/AddPlace").then((m) => m.AddPlaceSheet), { ssr: false });
const ShareModal = dynamic(() => import("../share/ShareModal").then((m) => m.ShareModal), { ssr: false });

/** Layar utama: peta penuh layar dengan kontrol mengambang (DESIGN.md 7). */
export function MapApp({ initialSlug }: { initialSlug?: string }) {
  const panel = useApp((s) => s.panel);
  const shareOpen = useApp((s) => !!s.shareTarget);
  const addMode = useApp((s) => s.addMode);
  const selectedId = useApp((s) => s.selectedId);
  const placesLoaded = useApp((s) => s.places.length > 0);
  const isDesktop = useIsDesktop();

  useEffect(restorePrefs, []);
  useDataSync();
  useRegisterVisit();
  const tMore = useTranslations("more");
  useFavoriteAlerts((name, st) => tMore(st === "available" ? "favAlertAvailable" : "favAlertEmpty", { name }));
  useGeolocationBootstrap();

  // Buka SPBU dari tautan berbagi /spbu/[slug]
  useEffect(() => {
    if (!initialSlug || !placesLoaded) return;
    const p = useApp.getState().places.find((x) => x.slug === initialSlug);
    if (p) useApp.getState().select(p.id, { fly: true, open: !window.matchMedia("(min-width: 1024px)").matches });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSlug, placesLoaded]);

  const sheetOpen = panel === "list" || panel === "detail" || panel === "report" || panel === "layers";
  const drawerOpen = isDesktop && (panel === "list" || panel === "detail" || panel === "report");
  const detailLike = panel === "detail" || panel === "report";
  // Saat detail terbuka di HP, dock disembunyikan (DESIGN.md 7.2)
  const showDock = isDesktop || !sheetOpen;

  return (
    <div className={`app-root${drawerOpen ? " drawer-open" : ""}${addMode === "pick" ? " picking" : ""}`}>
      <StationMap />

      <div className="overlay">
        <div className="top-cluster">
          <div className="top-left">
            <SearchBar />
            <IdentityCard>{!isDesktop && <InfoMenu />}</IdentityCard>
          </div>
          {(!sheetOpen || isDesktop) && <ControlCard>{isDesktop && <InfoMenu />}</ControlCard>}
        </div>
        <div className="top-cluster" style={{ marginTop: 8 }}>
          <QueueBar />
        </div>
        {(!sheetOpen || isDesktop) && (
          <div className="top-cluster" style={{ marginTop: 8, flexDirection: "column" }}>
            <SystemBanners />
            <AnnouncementBanner />
            {!isDesktop && <StatusStrip />}
          </div>
        )}

        <div className="bottom-cluster">
          {!isDesktop && !sheetOpen && <MapFabs />}
          {isDesktop && !sheetOpen && <StatusStrip />}
          {!detailLike && <LocationCard />}
          {!detailLike && !(isDesktop && selectedId) && <NearbyPrompt />}
          {showDock && !(isDesktop && panel === "detail") && <ActionDock />}
        </div>
      </div>

      {!sheetOpen && isDesktop && <MapFabs bottom={120} />}
      {isDesktop && !sheetOpen && <MapLegend />}

      {panel === "list" && <StationList />}
      {panel === "detail" && selectedId && <StationDetail />}
      {panel === "report" && selectedId && <ReportSheet />}
      {panel === "layers" && <LayerPanel />}
      {panel === "search" && <SearchPanel />}
      {addMode === "pick" && <AddPlacePicker />}
      {addMode === "form" && <AddPlaceSheet />}
      {shareOpen && <ShareModal />}
      <Toast />
    </div>
  );
}

