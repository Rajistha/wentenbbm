import type { StyleSpecification } from "maplibre-gl";

// Basemap topografi Esri (relief, batimetri, label) seperti prototipe acuan.
// Atribusi Esri wajib tampil. Untuk produksi trafik tinggi, periksa ketentuan layanan Esri
// atau ganti lewat NEXT_PUBLIC_MAP_STYLE_URL (style JSON MapLibre).
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const ATTRIBUTION =
  'Free prototype · not affiliated with Pertamina | Powered by <a href="https://www.esri.com">Esri</a> · Basemap: Esri, HERE, Garmin, USGS, NGA, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Stations © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL)';

function raster(id: string, path: string, maxzoom = 18): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      base: {
        type: "raster",
        tiles: [`${ESRI}/${path}/MapServer/tile/{z}/{y}/{x}`],
        tileSize: 256,
        maxzoom,
        attribution: ATTRIBUTION,
      },
    },
    layers: [{ id, type: "raster", source: "base" }],
  };
}

export const LIGHT_STYLE: StyleSpecification = raster("esri-topo", "World_Topo_Map");
