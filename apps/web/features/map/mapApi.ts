import type { Map as MlMap } from "maplibre-gl";

/** Akses imperatif ke peta untuk kontrol mengambang. Hanya tipe maplibre yang diimpor di sini. */
export const mapApi: { current: MlMap | null } = { current: null };
