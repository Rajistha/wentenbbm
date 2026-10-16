"use client";
import {
  decodePlaces,
  decodeStationStatus,
  type FuelFilter,
  type FuelStatus,
  type FuelType,
  type OfficialPrices,
  type Place,
  type PlacesPayload,
  type StationStatus,
  type StationStatusTuple,
} from "@wenten/core";
import { create } from "zustand";
import { lsGet, lsSet } from "./idb";
import type { AnnouncementRow, StatusResponse } from "./types";

export type Panel = "list" | "detail" | "report" | "layers" | "info" | "search" | null;
export type LiveVia = "loading" | "realtime" | "polling" | "fallback" | "cache";
export type GeoState = "idle" | "prompt" | "requesting" | "granted" | "denied" | "unavailable";

export interface UserPosition {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
  simulated?: boolean;
}

interface Prefs {
  fuelFilter: FuelFilter;
  onlyAvailable: boolean;
  showRetail: boolean;
  onlyConfirmed: boolean;
  showTerminals: boolean;
}

const PREFS_KEY = "wenten-prefs";
const defaultPrefs: Prefs = { fuelFilter: "all", onlyAvailable: false, showRetail: true, onlyConfirmed: false, showTerminals: true };

interface AppState extends Prefs {
  places: Place[];
  placeById: Map<string, Place>;
  fuelTypes: FuelType[];
  statuses: Map<string, StationStatus>;
  generatedAt: string | null;
  onlineNow: number;
  reportsTotal: number;
  /** null = server belum mengirim (migrasi 0011 belum dijalankan). */
  reports24h: number | null;
  /** Orang yang sedang mengantre se-Bali; null = migrasi 0014 belum dijalankan. */
  queuingNow: number | null;
  /** Syarat radius ke SPBU untuk melapor. false bila admin mematikannya. */
  geofenceOn: boolean;
  /** Harga resmi Pertamina (acuan bila belum ada harga warga); null bila belum diatur. */
  officialPrices: OfficialPrices | null;
  /** null = server belum mengirim angka pengunjung (migrasi 0007 belum dijalankan). */
  visitorsTotal: number | null;
  readOnly: boolean;
  demo: boolean;
  liveVia: LiveVia;
  loadError: boolean;
  announcements: AnnouncementRow[];
  /** Perubahan status terbaru (untuk animasi penanda). */
  pulseId: string | null;

  statusFilter: FuelStatus | null;
  selectedId: string | null;
  panel: Panel;
  detailFromList: boolean;
  highlightNavigate: boolean;
  /** Bertambah setiap kali peta harus terbang ke SPBU terpilih. */
  flyToken: number;
  listFocusSearch: boolean;
  /** Kata cari yang dibawa dari panel pencarian ke daftar. */
  listQuery: string;
  /** Penanda tempat hasil pencarian (mis. Kuta) di peta. */
  searchPin: { lat: number; lng: number; name: string } | null;
  shareTarget: { url: string; title: string; text: string; slug?: string } | null;
  /** Alur tambah tempat: pilih titik di peta, lalu isi formulir. */
  addMode: "pick" | "form" | null;
  addPoint: { lat: number; lng: number } | null;
  /** Tempat tambahan saya yang masih menunggu verifikasi (hanya terlihat oleh saya). */
  pendingIds: string[];
  /** Jawaban pertama dari tombol di detail SPBU, melewati pertanyaan pertama. */
  reportPreset: "available" | "limited" | "empty" | null;

  user: UserPosition | null;
  geoState: GeoState;
  /** "Terdekat yang ada BBM" menunggu lokasi. */
  pendingNearest: boolean;

  toast: { id: number; text: string } | null;

  applyPlaces(p: PlacesPayload): void;
  applyStatus(s: StatusResponse, via: LiveVia): void;
  applyStationUpdates(rows: StationStatusTuple[]): void;
  setLiveVia(v: LiveVia): void;
  setLoadError(v: boolean): void;

  setPrefs(p: Partial<Prefs>): void;
  setStatusFilter(s: FuelStatus | null): void;
  select(id: string | null, opts?: { fly?: boolean; open?: boolean; fromList?: boolean; highlight?: boolean }): void;
  openPanel(p: Panel, opts?: { focusSearch?: boolean }): void;
  setSearchPin(p: { lat: number; lng: number; name: string } | null): void;
  openShare(t: { url: string; title: string; text: string; slug?: string }): void;
  startAdd(): void;
  setAddMode(m: "pick" | "form" | null): void;
  setAddPoint(p: { lat: number; lng: number } | null): void;
  endAdd(): void;
  addPlaceLocal(place: Place, pending: boolean): void;
  closeShare(): void;
  startReport(preset: "available" | "limited" | "empty" | null): void;
  closePanel(): void;

  setUser(u: UserPosition | null): void;
  setGeoState(g: GeoState): void;
  setPendingNearest(v: boolean): void;
  showToast(text: string): void;
  hideToast(): void;
}

const MINE_KEY = "wenten-my-places";

// Penanda isi status terakhir, supaya polling yang hasilnya sama tidak memicu render ulang peta dan daftar
let lastStatusKey = "";

export const useApp = create<AppState>((set, get) => ({
  ...defaultPrefs,
  places: [],
  placeById: new Map(),
  fuelTypes: [],
  statuses: new Map(),
  generatedAt: null,
  onlineNow: 0,
  reportsTotal: 0,
  reports24h: null,
  queuingNow: null,
  geofenceOn: true,
  officialPrices: null,
  visitorsTotal: null,
  readOnly: false,
  demo: false,
  liveVia: "loading",
  loadError: false,
  announcements: [],
  pulseId: null,

  statusFilter: null,
  selectedId: null,
  panel: null,
  detailFromList: false,
  highlightNavigate: false,
  flyToken: 0,
  listFocusSearch: false,
  listQuery: "",
  searchPin: null,
  shareTarget: null,
  addMode: null,
  addPoint: null,
  pendingIds: [],
  reportPreset: null,

  user: null,
  geoState: "idle",
  pendingNearest: false,
  toast: null,

  applyPlaces(p) {
    const snap = decodePlaces(p);
    // Tambahan saya yang menunggu verifikasi belum ada di snapshot publik: gabungkan, dan buang yang sudah disetujui
    const mine = lsGet<Place[]>(MINE_KEY, []).filter((m) => !snap.places.some((x) => x.id === m.id));
    lsSet(MINE_KEY, mine);
    const places = [...snap.places, ...mine];
    set({ places, placeById: new Map(places.map((x) => [x.id, x])), fuelTypes: snap.fuelTypes, pendingIds: mine.map((m) => m.id) });
  },
  applyStatus(s, via) {
    const key = JSON.stringify(s.stations);
    const unchanged = key === lastStatusKey && get().statuses.size > 0;
    lastStatusKey = key;
    set({
      ...(unchanged ? {} : { statuses: new Map(s.stations.map((t) => [t[0], decodeStationStatus(t)])) }),
      generatedAt: s.generated_at,
      onlineNow: s.online_now,
      reportsTotal: s.reports_total,
      reports24h: s.reports_24h ?? get().reports24h,
      queuingNow: s.queuing_now ?? get().queuingNow,
      geofenceOn: s.geofence_enabled ?? true,
      officialPrices: s.official_prices ?? get().officialPrices,
      visitorsTotal: s.visitors_total ?? get().visitorsTotal,
      readOnly: !!s.read_only,
      demo: !!s.demo,
      announcements: s.announcements ?? [],
      liveVia: get().liveVia === "realtime" && via === "polling" ? "realtime" : via,
      loadError: false,
    });
  },
  applyStationUpdates(rows) {
    if (!rows.length) return;
    lastStatusKey = "";
    const next = new Map(get().statuses);
    for (const t of rows) {
      const s = decodeStationStatus(t);
      if (s.overall === "unknown" && !s.queue) next.delete(s.id);
      else next.set(s.id, s);
    }
    set({ statuses: next, generatedAt: new Date().toISOString(), pulseId: rows.at(-1)![0] });
  },
  setLiveVia: (liveVia) => set({ liveVia }),
  setLoadError: (loadError) => set({ loadError }),

  setPrefs(p) {
    set(p);
    const { fuelFilter, onlyAvailable, showRetail, onlyConfirmed, showTerminals } = get();
    lsSet(PREFS_KEY, { fuelFilter, onlyAvailable, showRetail, onlyConfirmed, showTerminals });
  },
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  select(id, opts = {}) {
    if (!id) {
      set({ selectedId: null, highlightNavigate: false, panel: get().panel === "detail" ? null : get().panel });
      return;
    }
    set((s) => ({
      searchPin: null,
      selectedId: id,
      highlightNavigate: !!opts.highlight,
      detailFromList: !!opts.fromList,
      panel: opts.open ? "detail" : s.panel === "detail" || s.panel === "report" ? null : s.panel,
      flyToken: opts.fly ? s.flyToken + 1 : s.flyToken,
    }));
  },
  openPanel: (panel, opts = {}) => set({ panel, listFocusSearch: !!opts.focusSearch, reportPreset: null }),
  setSearchPin: (searchPin) => set({ searchPin }),
  openShare: (shareTarget) => set({ shareTarget }),
  startAdd: () => set({ addMode: "pick", addPoint: null, panel: null, selectedId: null, searchPin: null }),
  setAddMode: (addMode) => set({ addMode }),
  setAddPoint: (addPoint) => set({ addPoint }),
  endAdd: () => set({ addMode: null, addPoint: null }),
  addPlaceLocal(place, pending) {
    const s = get();
    if (s.placeById.has(place.id)) return;
    const places = [...s.places, place];
    set({ places, placeById: new Map(places.map((x) => [x.id, x])), pendingIds: pending ? [...s.pendingIds, place.id] : s.pendingIds });
    // Yang menunggu verifikasi hanya ada di perangkat ini, simpan agar tidak hilang saat dimuat ulang
    if (pending) lsSet(MINE_KEY, [...lsGet<Place[]>(MINE_KEY, []), place]);
  },
  closeShare: () => set({ shareTarget: null }),
  startReport: (reportPreset) => set({ panel: "report", reportPreset }),
  closePanel: () => set({ panel: null, listFocusSearch: false }),

  setUser: (user) => set({ user }),
  setGeoState: (geoState) => set({ geoState }),
  setPendingNearest: (pendingNearest) => set({ pendingNearest }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
  hideToast: () => set({ toast: null }),
}));

/** Pulihkan filter dari perangkat (US-02). Dipanggil sekali di klien. */
export function restorePrefs() {
  const p = lsGet<Partial<Prefs>>(PREFS_KEY, {});
  useApp.setState({ ...defaultPrefs, ...p });
}
