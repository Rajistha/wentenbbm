import { formatNumber, formatWita, REGIONS, type Locale } from "@wenten/core";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Icon } from "@/features/common/Icon";
import { StatusGlyph } from "@/features/common/StatusGlyph";
import { HourlyChart } from "@/features/data/HourlyChart";
import { Link } from "@/i18n/navigation";
import { getDashboard } from "@/lib/backend/server";

// ISR 60 detik (ARCHITECTURE.md 3.3). Mode demo membaca data hidup, jadi tetap dinamis.
export const revalidate = 60;

import type { Metadata } from "next";
import { alternatesFor } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/data">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "data" });
  return { title: `${t("title")} | Wenten BBM`, alternates: alternatesFor(locale, "/data") };
}

export default async function DataPage({ params }: PageProps<"/[locale]/data">) {
  const { locale: l } = await params;
  setRequestLocale(l);
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("data");
  const ts = await getTranslations("status");
  const d = await getDashboard();

  const num = (n: number) => formatNumber(n, locale);
  const fuelId = 1; // tampilan wilayah default: Pertalite
  const regionRows = REGIONS.map((r) => {
    const row = d.regions.find((x) => x[0] === r.id && x[1] === fuelId);
    return { r, c: row ? [row[2], row[3], row[4], row[5]] : [0, 0, 0, 0] };
  });

  const up = d.uptime;
  const totalChecks = up.reduce((a, u) => a + u[2], 0);
  const okChecks = up.reduce((a, u) => a + u[1], 0);
  const uptimePct = totalChecks ? ((okChecks / totalChecks) * 100).toLocaleString(locale === "id" ? "id-ID" : "en-GB", { maximumFractionDigits: 1 }) : "-";
  const hourCls = (u: [string, number, number]) => (u[2] === 0 ? "u-none" : u[1] === u[2] ? "u-full" : u[1] === 0 ? "u-down" : "u-partial");
  const hours = (cls: string) => up.filter((u) => hourCls(u) === cls).length;
  const dur = (h: number) => (h >= 1 ? t("hoursMinutes", { h, m: 0 }) : t("minutes", { m: 0 }));
  const partialMin = up.filter((u) => hourCls(u) === "u-partial").reduce((a, u) => a + (u[2] - u[1]), 0);
  const downMin = up.filter((u) => hourCls(u) === "u-down").length * 60;
  const fullH = hours("u-full");

  const rej = d.rejections_24h;
  const kindLabel = { spam: t("incident_spam"), partial: t("incident_partial"), down: t("incident_down"), maintenance: t("incident_maintenance") };

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1 className="display">{t("title")}</h1>
          <p className="caption muted" style={{ margin: "4px 0 0" }}>
            {t("live", { time: formatWita(d.generated_at, locale) })}
          </p>
          {d.demo && <p className="demo-badge" style={{ display: "inline-block", marginTop: 8 }}>{t("demoNote")}</p>}
        </div>
        <Link href="/" className="btn">
          <Icon name="back" /> {t("back")}
        </Link>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="caption muted">{t("visitors")}</div>
          <div className="value">{num(d.visitors_total)}</div>
          <div className="caption muted">{t("since", { time: formatWita(d.launched_at, locale) })}</div>
        </div>
        <div className="stat-card">
          <div className="caption muted">{t("reports")}</div>
          <div className="value">{num(d.reports_accepted)}</div>
          <div className="caption muted">{t("fromReporters", { n: num(d.reporters_unique) })}</div>
        </div>
        <div className="stat-card">
          <div className="caption muted">{t("fresh")}</div>
          <div className="value">
            {num(d.stations_fresh)} / {num(d.stations_total)}
          </div>
        </div>
        <div className="stat-card">
          <div className="caption muted">{t("uptime")}</div>
          <div className="value">{uptimePct}%</div>
          <div className="caption muted">{t("sinceLaunch")}</div>
        </div>
      </div>

      <section className="panel" aria-labelledby="h-regions">
        <h2 id="h-regions">
          {t("regions")} · Pertalite
        </h2>
        {regionRows.map(({ r, c }) => {
          const tot = c.reduce((a, b) => a + b, 0) || 1;
          const cls = ["seg-available", "seg-limited", "seg-empty", "seg-unknown"];
          return (
            <div key={r.id} className="region-row">
              <strong>{r.name}</strong>
              <div className="strip-bar" role="img" aria-label={`${r.name}: ${c.join(", ")}`}>
                {c.map((n, i) => (n ? <span key={i} className={cls[i]} style={{ flex: n / tot }} /> : null))}
              </div>
              <div className="region-counts">
                {(["available", "limited", "empty", "unknown"] as const).map((s, i) => (
                  <span key={s} className="status-inline" style={{ fontWeight: 500 }}>
                    <StatusGlyph status={s} size={13} label={ts(s)} /> {c[i]}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel" aria-labelledby="h-hourly">
        <h2 id="h-hourly">{t("hourly")}</h2>
        <HourlyChart rows={d.hourly} />
      </section>

      <section className="panel" aria-labelledby="h-uptime">
        <h2 id="h-uptime">{t("uptimeTitle")}</h2>
        <div className="uptime-bar" role="img" aria-label={t("uptimeTitle")}>
          {up.map((u) => (
            <span key={u[0]} className={hourCls(u)} title={`${formatWita(u[0], locale)}: ${u[1]}/${u[2]}`} />
          ))}
        </div>
        <div className="legend-inline" style={{ marginTop: 8 }}>
          <span>
            <i className="swatch u-full" /> {t("full")}
          </span>
          <span>
            <i className="swatch u-partial" /> {t("partial")}
          </span>
          <span>
            <i className="swatch u-down" /> {t("down")}
          </span>
          <span>
            <i className="swatch u-none" /> {t("noData")}
          </span>
        </div>
        <div className="dur-cards">
          <div className="dur-card" style={{ borderLeft: "4px solid var(--chart-available)" }}>
            <strong>{dur(fullH)}</strong>
            <div className="caption muted">{t("full")}</div>
          </div>
          <div className="dur-card" style={{ borderLeft: "4px solid var(--chart-limited)" }}>
            <strong>{t("minutes", { m: partialMin })}</strong>
            <div className="caption muted">{t("partial")}</div>
          </div>
          <div className="dur-card" style={{ borderLeft: "4px solid var(--chart-empty)" }}>
            <strong>{t("minutes", { m: downMin })}</strong>
            <div className="caption muted">{t("down")}</div>
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="h-inc">
        <h2 id="h-inc">{t("incidents")}</h2>
        {d.incidents.length === 0 && <p className="muted">{t("noIncidents")}</p>}
        {d.incidents.map((i) => (
          <div key={i.id} className="incident">
            <span className="tnum caption">
              {formatWita(i.started_at, locale)}
              {i.ended_at ? `–${formatWita(i.ended_at, locale)}` : ""}
            </span>
            <span className="incident-badge">{kindLabel[i.kind]}</span>
            <span>
              <strong>{i.title}</strong>
              <br />
              <span className="muted">{i.body}</span>
            </span>
          </div>
        ))}
      </section>

      <section className="panel" aria-labelledby="h-spam">
        <h2 id="h-spam">{t("spam")}</h2>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: 13 }}>{t("spamPeriod")}</p>
        <div className="spam-grid">
          <div className="spam-stat">
            <span className="spam-val tnum">{num(rej.out_of_range)}</span>
            <span className="spam-label">{t("spamOor")}</span>
          </div>
          <div className="spam-stat">
            <span className="spam-val tnum">{num(rej.rate_limit)}</span>
            <span className="spam-label">{t("spamRl")}</span>
          </div>
          <div className="spam-stat">
            <span className="spam-val tnum">{num(rej.other)}</span>
            <span className="spam-label">{t("spamOther")}</span>
          </div>
          <div className="spam-stat">
            <span className="spam-val tnum">{num(rej.quarantined_reports)}</span>
            <span className="spam-label">{t("spamQr")}</span>
          </div>
          <div className="spam-stat">
            <span className="spam-val tnum">{num(rej.quarantined_places)}</span>
            <span className="spam-label">{t("spamQp")}</span>
          </div>
        </div>
      </section>

      <section className="panel prose" aria-labelledby="h-method">
        <h2 id="h-method">{t("method")}</h2>
        <p>{t("methodBody")}</p>
        <p>{t("privacyBody")}</p>
        <p className="caption muted">{t("license")}</p>
      </section>
    </main>
  );
}
