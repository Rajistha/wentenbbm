import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { REGIONS } from "@wenten/core";
import { MapApp } from "@/features/map/MapApp";
import { Link } from "@/i18n/navigation";
import { abs, alternatesFor, jsonLd, ogLocale, websiteLd } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: alternatesFor(locale, "/"),
    openGraph: { title: t("title"), description: t("description"), type: "website", locale: ogLocale(locale), url: abs(locale) },
  };
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("seo");
  return (
    <>
      <MapApp />
      {/* Teks yang bisa dibaca mesin pencari dan pembaca layar. Peta sendiri digambar di kanvas. */}
      <div className="sr-only">
        <h1>{t("h1")}</h1>
        <p>{t("intro")}</p>
        <nav aria-label={t("regionsNav")}>
          <h2>{t("regionsNav")}</h2>
          <ul>
            {REGIONS.map((r) => (
              <li key={r.id}>
                <Link href={`/wilayah/${r.slug}`}>{t("regionLink", { name: r.name })}</Link>
              </li>
            ))}
            <li>
              <Link href="/data">{t("dataLink")}</Link>
            </li>
            <li>
              <Link href="/tentang">{t("aboutLink")}</Link>
            </li>
          </ul>
        </nav>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(websiteLd(locale)) }} />
    </>
  );
}
