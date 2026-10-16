"use client";
import { Icon } from "@/features/common/Icon";
import { Logo } from "@/features/common/Logo";
import { formatNumber, formatWita, type FuelFilter, type Locale } from "@wenten/core";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useShallow } from "zustand/react/shallow";
import { useApp } from "@/lib/store";
import { useNow } from "../common/RelativeTime";

/** Kartu identitas kiri atas: merek, status langsung, angka (DESIGN.md 7.1). */
export function IdentityCard({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("identity");
  const locale = useLocale() as Locale;
  const { liveVia, generatedAt, onlineNow, reportsTotal, visitorsTotal, demo } = useApp(
    useShallow((s) => ({ liveVia: s.liveVia, generatedAt: s.generatedAt, onlineNow: s.presenceCount ?? s.onlineNow, reportsTotal: s.reportsTotal, visitorsTotal: s.visitorsTotal, demo: s.demo })),
  );
  useNow(10_000);
  const on = liveVia === "realtime" || liveVia === "polling";
  const label =
    liveVia === "loading"
      ? t("loading")
      : liveVia === "cache"
        ? t("cache")
        : liveVia === "fallback"
          ? t("fallback")
          : liveVia === "realtime"
            ? t("live")
            : t("polling");
  const time = generatedAt ? formatWita(generatedAt, locale) : "";

  return (
    <div className="float-card identity">
      <Logo size={26} />
      <span className="live" role="status">
        <span className={`live-dot ${on ? "on" : "off"}`} aria-hidden="true" />
        <span className="live-text">
          {label}
          {time && <span className="identity-time">{` · ${t("updated", { time })}`}</span>}
        </span>
      </span>
      {demo && <span className="demo-badge">{t("demo")}</span>}
      {children && <span className="identity-menu">{children}</span>}
      <span className="identity-extra muted">
        {[
          onlineNow > 0 ? t("online", { n: formatNumber(onlineNow, locale) }) : null,
          reportsTotal > 0 ? t("reports", { n: formatNumber(reportsTotal, locale) }) : null,
          visitorsTotal != null && visitorsTotal > 0 ? t("visitors", { n: formatNumber(visitorsTotal, locale) }) : null,
        ]
          .filter(Boolean)
          .join(" · ") || t("justLaunched")}
      </span>
      <Link href="/data" className="identity-extra">
        {t("seeData")} <Icon name="next" size={14} style={{ verticalAlign: "middle" }} />
      </Link>
    </div>
  );
}

/** Kartu kontrol kanan atas: tab jenis BBM (DESIGN.md 7.1). */
export function ControlCard({ children }: { children?: React.ReactNode }) {
  const t = useTranslations("fuel");
  const fuelTypes = useApp((s) => s.fuelTypes);
  const fuelFilter = useApp((s) => s.fuelFilter);
  const setPrefs = useApp((s) => s.setPrefs);
  const main = fuelTypes.filter((f) => f.isFilterTab);
  const others = fuelTypes.filter((f) => !f.isFilterTab);
  const otherActive = typeof fuelFilter === "number" && others.some((f) => f.id === fuelFilter);

  const pick = (v: FuelFilter) => setPrefs({ fuelFilter: v });

  return (
    <div className="float-card control">
      <div className="chip-row" role="group" aria-label="Jenis BBM">
        <button type="button" className="chip" aria-pressed={fuelFilter === "all"} onClick={() => pick("all")}>
          {t("all")}
        </button>
        {main.map((f) => (
          <button key={f.id} type="button" className="chip" aria-pressed={fuelFilter === f.id} onClick={() => pick(f.id)}>
            {f.name}
          </button>
        ))}
        {others.length > 0 && (
          <select
            className={`chip chip-select${otherActive ? " active" : ""}`}
            aria-label={t("other")}
            value={otherActive ? String(fuelFilter) : ""}
            onChange={(e) => e.target.value && pick(Number(e.target.value))}
          >
            <option value="" disabled>
              {t("other")}
            </option>
            {others.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="control-meta">{children}</div>
    </div>
  );
}
