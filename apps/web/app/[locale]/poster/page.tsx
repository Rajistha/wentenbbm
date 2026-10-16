import type { Metadata } from "next";
import QRCode from "qrcode";
import stationsJson from "@wenten/db/data/stations.json";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/features/common/Logo";
import { PrintButton } from "@/features/common/PrintButton";
import { abs } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ spbu?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "poster" });
  // Halaman cetak: tidak perlu muncul di pencarian
  return { title: `${t("title")} | Wenten BBM`, robots: { index: false, follow: false } };
}

/** Poster A4 siap cetak berisi kode QR, untuk ditempel di SPBU, warung, atau grup RT. ?spbu=slug untuk poster per SPBU. */
export default async function Poster({ params, searchParams }: Props) {
  const { locale } = await params;
  const { spbu } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("poster");
  const m = await getTranslations("meta");

  const place = spbu ? (stationsJson as unknown as { slug: string; name: string }[]).find((p) => p.slug === spbu) : undefined;
  const url = place ? abs(locale, `/spbu/${place.slug}`) : abs(locale, "/");
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });

  return (
    <main className="poster-page">
      <div className="poster-tools no-print">
        <PrintButton label={t("print")} />
        <p className="caption muted">{t("hint")}</p>
      </div>
      <article className="poster">
        <header className="poster-brand">
          <Logo size={44} />
        </header>
        <h1>{place ? t("stationTitle", { name: place.name }) : t("title")}</h1>
        <p className="poster-lead">{place ? t("stationLead") : t("lead")}</p>
        <div className="poster-qr" role="img" aria-label={t("qrAlt")} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="poster-url">{url.replace(/^https?:\/\//, "")}</p>
        <ol className="poster-steps">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
        <footer>{m("tagline")}</footer>
      </article>
      <style>{`
        .poster-page { min-height: 100dvh; padding: 16px; background: #f1f5f9; color: #0f172a; font-family: var(--font-jakarta), system-ui, sans-serif; }
        .poster-tools { max-width: 560px; margin: 0 auto 12px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
        .poster { max-width: 560px; margin: 0 auto; padding: 40px 36px; background: #fff; border-radius: 16px; text-align: center; box-shadow: 0 8px 30px rgb(15 23 42 / .08); }
        .poster-brand { display: flex; justify-content: center; margin-bottom: 20px; }
        .poster h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.2; }
        .poster-lead { margin: 0 0 20px; font-size: 16px; color: #475569; }
        .poster-qr { width: min(300px, 70%); margin: 0 auto; }
        .poster-qr svg { display: block; width: 100%; height: auto; }
        .poster-url { margin: 10px 0 20px; font-size: 20px; font-weight: 700; letter-spacing: .2px; }
        .poster-steps { margin: 0 auto 20px; padding: 0; max-width: 380px; text-align: left; font-size: 16px; line-height: 1.5; list-style-position: inside; }
        .poster footer { font-size: 14px; color: #475569; }
        @media print {
          .no-print { display: none !important; }
          .poster-page { padding: 0; background: #fff; }
          .poster { max-width: none; box-shadow: none; border-radius: 0; padding: 18mm 16mm; }
          .poster h1 { font-size: 40px; }
          .poster-lead { font-size: 20px; }
          .poster-qr { width: 110mm; }
          .poster-url { font-size: 26px; }
          .poster-steps { font-size: 20px; max-width: 150mm; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
    </main>
  );
}
