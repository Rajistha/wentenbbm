import { SITE_URL } from "./env";

export const BASE = SITE_URL.replace(/\/$/, "");
export const SITE_NAME = "Wenten BBM";

/** Jalur sesuai aturan routing: Indonesia tanpa awalan, Inggris dengan /en. */
export function localePath(locale: string, path = "/"): string {
  const p = path === "/" ? "" : path;
  if (locale === "en") return `/en${p}` || "/en";
  return p || "/";
}

export const abs = (locale: string, path = "/") => `${BASE}${localePath(locale, path)}`;

/** canonical + hreflang untuk satu halaman. */
export function alternatesFor(locale: string, path = "/") {
  return {
    canonical: abs(locale, path),
    languages: { id: abs("id", path), en: abs("en", path), "x-default": abs("id", path) },
  };
}

export const ogLocale = (locale: string) => (locale === "en" ? "en_US" : "id_ID");

/** Serialisasi JSON-LD yang aman untuk disisipkan di <script>. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function websiteLd(locale: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${BASE}/#website`,
        url: abs(locale),
        name: SITE_NAME,
        inLanguage: locale,
        description:
          locale === "en"
            ? "Live map of Bali petrol stations reported to have fuel, from reports by people on site."
            : "Peta SPBU di Bali yang dilaporkan masih punya stok BBM, dari laporan warga yang sedang di lokasi.",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${abs(locale)}?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": `${BASE}/#org`,
        name: SITE_NAME,
        url: BASE,
        logo: `${BASE}/icon.svg`,
      },
    ],
  };
}
