import { getTranslations, setRequestLocale } from "next-intl/server";
import { Icon } from "@/features/common/Icon";
import { Link } from "@/i18n/navigation";

import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/tentang">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: `${t("title")} | Wenten BBM`, alternates: alternatesFor(locale, "/tentang") };
}

export default async function About({ params }: PageProps<"/[locale]/tentang">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const d = await getTranslations("data");
  return (
    <main className="page prose">
      <div className="page-header">
        <h1 className="display">{t("title")}</h1>
        <Link href="/" className="btn">
          <Icon name="back" /> {d("back")}
        </Link>
      </div>
      <p>{t("intro")}</p>
      <h2 className="heading">{t("howTitle")}</h2>
      <ol>
        <li>{t("how1")}</li>
        <li>{t("how2")}</li>
        <li>{t("how3")}</li>
      </ol>
      <h2 className="heading">{t("safetyTitle")}</h2>
      <p>{t("safety")}</p>
      <h2 className="heading">{t("privacyTitle")}</h2>
      <p>{d("privacyBody")}</p>
      <h2 className="heading">{t("disclaimerTitle")}</h2>
      <p>{t("disclaimer")}</p>
      <p className="caption muted">{t("data")}</p>
    </main>
  );
}
