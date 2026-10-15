import { REGIONS } from "@wenten/core";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Icon, type IconName } from "@/features/common/Icon";
import { Logo } from "@/features/common/Logo";
import { Link } from "@/i18n/navigation";
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
  const m = await getTranslations("meta");

  const steps: { icon: IconName; title: string; text: string }[] = [
    { icon: "pin", title: t("step1Title"), text: t("how1") },
    { icon: "verified", title: t("step2Title"), text: t("how2") },
    { icon: "clock", title: t("step3Title"), text: t("how3") },
  ];

  return (
    <main className="about">
      <header className="about-top">
        <Link href="/" aria-label="Wenten BBM">
          <Logo size={32} />
        </Link>
        <Link href="/" className="btn">
          <Icon name="back" /> {d("back")}
        </Link>
      </header>

      <section className="about-hero">
        <h1>{m("tagline")}</h1>
        <p className="about-lead">{t("intro")}</p>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="about-h2">
          {t("howTitle")}
        </h2>
        <ol className="about-steps">
          {steps.map((s, i) => (
            <li key={i} className="about-card">
              <span className="about-step-no">{i + 1}</span>
              <span className="about-ico">
                <Icon name={s.icon} size={22} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="about-callout" aria-labelledby="safe">
        <span className="about-ico">
          <Icon name="fuel" size={22} />
        </span>
        <div>
          <h2 id="safe">{t("safetyTitle")}</h2>
          <p>{t("safety")}</p>
        </div>
      </section>

      <section className="about-two">
        <div className="about-card">
          <span className="about-ico">
            <Icon name="lock" size={22} />
          </span>
          <h2>{t("privacyTitle")}</h2>
          <p>{d("privacyBody")}</p>
        </div>
        <div className="about-card about-warn">
          <span className="about-ico about-ico-warn">
            <Icon name="alert" size={22} />
          </span>
          <h2>{t("disclaimerTitle")}</h2>
          <p>{t("disclaimer")}</p>
          <p className="about-small">{t("trademark")}</p>
        </div>
      </section>

      <section aria-labelledby="regions">
        <h2 id="regions" className="about-h2">
          {t("regionsTitle")}
        </h2>
        <div className="about-chips">
          {REGIONS.map((r) => (
            <Link key={r.id} href={`/wilayah/${r.slug}`} className="chip">
              {r.name}
            </Link>
          ))}
          <Link href="/data" className="chip">
            <Icon name="list" size={16} /> {t("dataLink")}
          </Link>
        </div>
      </section>

      <footer className="about-foot">
        <p>{t("credits")}</p>
        <p>{t("data")}</p>
      </footer>
    </main>
  );
}
