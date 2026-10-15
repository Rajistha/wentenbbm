import { encodeFuelType, encodePlace, type Place, type PlacesPayload } from "@wenten/core";
import stationsJson from "@wenten/db/data/stations.json";
import { DEMO_FUEL_TYPES } from "./demo/store";

/**
 * Daftar lokasi bawaan dari OpenStreetMap (data yang sama dengan seed.sql).
 * Dipakai sebagai cadangan bila database belum berisi data, supaya peta tetap menampilkan
 * lokasi SPBU Pertamina dan Pertamini walau belum ada laporan satu pun.
 */
export function staticPlacesPayload(): PlacesPayload {
  const places = (stationsJson as unknown as Place[]).map((p) => ({
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    brand: p.brand,
    code: p.code,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    regionId: p.regionId,
    is24h: p.is24h,
    fuelIds: p.fuelIds,
    address: p.address,
  }));
  return {
    v: 1,
    generated_at: new Date().toISOString(),
    fuel_types: DEMO_FUEL_TYPES.map(encodeFuelType),
    places: places.map(encodePlace),
  };
}
