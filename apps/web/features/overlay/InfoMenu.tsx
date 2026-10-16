"use client";
import { Icon } from "@/features/common/Icon";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { useApp } from "@/lib/store";
import { useShare } from "../stations/hooks";
import { LegendList } from "./MapLegend";

/** Tombol info: bantuan, legenda, data, tentang, bahasa, tema. */
export function InfoMenu() {
  const t = useTranslations("info");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const share = useShare();
  const tShare = useTranslations("share");
  const tDock = useTranslations("dock");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
      <div className="segmented lang-inline" role="radiogroup" aria-label={t("language")}>
        {(["id", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={locale === l}
            onClick={() => router.replace(pathname, { locale: l })}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={t("menu")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="info" />
      </button>
      {open && (
        <>
          <div className="scrim desktop-hidden" style={{ background: "transparent" }} onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            className="menu"
            role="dialog"
            aria-label={t("menu")}
            style={{ top: "calc(100% + 6px)", right: 0, width: 300, padding: 12, gap: 8, zIndex: 41 }}
          >
            <div className="menu-mobile-only" style={{ display: "grid", gap: 8 }}>
              <div className="label">{t("language")}</div>
              <div className="segmented" role="radiogroup" aria-label={t("language")}>
                {(["id", "en"] as const).map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={locale === l} onClick={() => router.replace(pathname, { locale: l })}>
                    {l === "id" ? "Indonesia" : "English"}
                  </button>
                ))}
              </div>
              <button type="button" className="btn" onClick={() => { setOpen(false); useApp.getState().openPanel("layers"); }}>
                <Icon name="layers" /> {tDock("layers")}
              </button>
              <button type="button" className="btn" onClick={() => { setOpen(false); useApp.getState().startAdd(); }}>
                <Icon name="plus" /> {tDock("add")}
              </button>
              <button type="button" className="btn" onClick={() => { setOpen(false); void share("/", tShare("text")); }}>
                <Icon name="share" /> {tDock("share")}
              </button>
            </div>
            <div>
              <div className="label">{t("help")}</div>
              <p className="caption muted" style={{ margin: "4px 0 0" }}>
                {t("helpBody")}
              </p>
            </div>
            <div className="legend" style={{ padding: 0 }}>
              <div className="label">{t("legend")}</div>
              <LegendList />
            </div>
            <Link href="/data" onClick={() => setOpen(false)} style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
              {t("data")} <Icon name="next" size={16} />
            </Link>
            <Link href="/tentang" onClick={() => setOpen(false)} style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
              {t("about")} <Icon name="next" size={16} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
