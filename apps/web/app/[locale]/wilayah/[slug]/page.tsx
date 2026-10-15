import { decodePlaces, decodeStationStatus, formatWita, REGIONS, type Locale } from "@wenten/core";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Icon } from "@/features/common/Icon";
import { StatusGlyph } from "@/features/common/StatusGlyph";
import { Link } from "@/i18n/navigation";
import { getPlacesPayload, getStatusPayload } from "@/lib/backend/server";
import { abs, alternatesFor, jsonLd, ogLocale } from "@/lib/seo";

export const revalidate = 300;

export function generateStaticParams() {
  return REGIONS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/wilayah/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const region = REGIONS.find((r) => r.slug === slug);
  if (!region) return {};
  const t = await getTranslations({ locale, namespace: "region" });
  const title = t("metaTitle", { name: region.name });
  const description = t("metaDescription", { name: region.name });
  return {
    title,
    description,
    alternates: alternatesFor(locale, `/wilayah/${slug}`),
    openGraph: { title, description, type: "website", locale: ogLocale(locale), url: abs(locale, `/wilayah/${slug}`) },
  };
}

export default async function RegionPage({ params }: PageProps<"/[locale]/wilayah/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const region = REGIONS.find((r) => r.slug === slug);
  if (!region) notFound();

  const t = await getTranslations("region");
  const ts = await getTranslations("status");
  const [placesPayload, status] = await Promise.all([getPlacesPayload(), getStatusPayload().catch(() => null)]);
  const places = decodePlaces(placesPayload).places.filter((p) => p.regionId === region.id && p.kind !== "terminal");
  const statuses = new Map((status?.stations ?? []).map((tp) => [tp[0], decodeStationStatus(tp)]));
  const spbu = places.filter((p) => p.kind === "spbu");
  const other = places.filter((p) => p.kind !== "spbu");
  const available = spbu.filter((p) => statuses.get(p.id)?.overall === "available").length;

  const ld = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("metaTitle", { name: region.name }),
    numberOfItems: spbu.length,
    itemListElement: spbu.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: abs(locale, `/spbu/${p.slug}`),
      name: p.name,
    })),
  };

  const row = (p: (typeof places)[number]) => {
    const st = statuses.get(p.id);
    const overall = st?.overall ?? "unknown";
    return (
      <li key={p.id} className="region-item">
        <Link href={`/spbu/${p.slug}`}>
          <StatusGlyph status={overall} size={22} label={ts(overall)} />
          <span className="region-item-text">
            <strong>{p.name}</strong>
            <span className="caption muted">{[p.code, p.address].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="caption muted">{ts(overall)}</span>
        </Link>
      </li>
    );
  };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="display">{t("h1", { name: region.name })}</h1>
          <p className="caption muted" style={{ margin: "4px 0 0" }}>
            {t("summary", { total: spbu.length, available })}
            {status ? ` · ${formatWita(status.generated_at, locale as Locale)}` : ""}
          </p>
        </div>
        <Link href="/" className="btn btn-primary">
          <Icon name="locate" /> {t("openMap")}
        </Link>
      </div>

      <p className="prose" style={{ maxWidth: "68ch" }}>
        {t("intro", { name: region.name })}
      </p>

      <ul className="region-list">{spbu.map(row)}</ul>

      {other.length > 0 && (
        <>
          <h2 className="heading" style={{ margin: "24px 0 8px" }}>
            {t("retail")}
          </h2>
          <ul className="region-list">{other.map(row)}</ul>
        </>
      )}

      <nav className="region-nav" aria-label={t("otherRegions")}>
        <h2 className="heading">{t("otherRegions")}</h2>
        <div className="sr-chips" style={{ padding: 0 }}>
          {REGIONS.filter((r) => r.id !== region.id).map((r) => (
            <Link key={r.id} href={`/wilayah/${r.slug}`} className="chip">
              {r.name}
            </Link>
          ))}
        </div>
      </nav>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
    </main>
  );
}
