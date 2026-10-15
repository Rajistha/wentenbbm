import { formatWita, REGIONS, type Locale } from "@wenten/core";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { MapApp } from "@/features/map/MapApp";
import { getPlaceBySlug } from "@/lib/backend/server";
import { abs, alternatesFor, jsonLd, ogLocale } from "@/lib/seo";

export const dynamic = "force-dynamic";

const BRAND_NAME = { pertamina: "Pertamina", shell: "Shell", bp: "BP", vivo: "Vivo", other: "", none: "" } as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/spbu/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const found = await getPlaceBySlug(slug).catch(() => null);
  if (!found) return {};
  const t = await getTranslations({ locale, namespace: "status" });
  const ts = await getTranslations({ locale, namespace: "station" });
  const region = REGIONS.find((r) => r.id === found.place.regionId)?.name ?? "Bali";
  const overall = found.status?.overall ?? "unknown";
  const title = ts("metaTitle", { name: found.place.name, region });
  const description = ts("metaDescription", { name: found.place.name, region, status: t(overall).toLowerCase() });
  return {
    title,
    description,
    alternates: alternatesFor(locale, `/spbu/${slug}`),
    openGraph: { title, description, type: "website", locale: ogLocale(locale), url: abs(locale, `/spbu/${slug}`) },
  };
}

export default async function StationPage({ params }: PageProps<"/[locale]/spbu/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const found = await getPlaceBySlug(slug).catch(() => null);
  if (!found) notFound();
  const { place, status } = found;
  const t = await getTranslations("status");
  const ts = await getTranslations("station");
  const region = REGIONS.find((r) => r.id === place.regionId)?.name ?? "Bali";
  const overall = status?.overall ?? "unknown";

  const ld = {
    "@context": "https://schema.org",
    "@type": place.kind === "spbu" ? "GasStation" : "LocalBusiness",
    "@id": abs(locale, `/spbu/${slug}`),
    name: place.name,
    url: abs(locale, `/spbu/${slug}`),
    brand: BRAND_NAME[place.brand] ? { "@type": "Brand", name: BRAND_NAME[place.brand] } : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: place.address ?? undefined,
      addressRegion: "Bali",
      addressLocality: region,
      addressCountry: "ID",
    },
    geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng },
    openingHours: place.is24h ? "Mo-Su 00:00-23:59" : undefined,
    identifier: place.code ?? undefined,
    hasMap: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
  };

  return (
    <>
      <MapApp initialSlug={slug} />
      <article className="sr-only">
        <h1>{ts("h1", { name: place.name, region })}</h1>
        <p>
          {[place.code, place.address, region].filter(Boolean).join(", ")}.{" "}
          {ts("statusLine", {
            status: t(overall),
            time: status?.lastReportAt ? formatWita(status.lastReportAt, locale as Locale, true) : ts("noReport"),
          })}
        </p>
        {status && status.fuels.length > 0 && (
          <ul>
            {status.fuels.map((f) => (
              <li key={f.fuelTypeId}>{t(f.status)}</li>
            ))}
          </ul>
        )}
        <p>{ts("disclaimer")}</p>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </>
  );
}
