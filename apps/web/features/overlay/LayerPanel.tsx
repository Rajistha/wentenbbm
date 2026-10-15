"use client";
import { Icon } from "@/features/common/Icon";
import { useTranslations } from "next-intl";
import { useApp } from "@/lib/store";
import { BottomSheet } from "../common/BottomSheet";

/** Panel kecil: pengecer, terminal BBM, hanya yang dikonfirmasi (DESIGN.md 7.2). */
export function LayerPanel() {
  const t = useTranslations("layers");
  const showRetail = useApp((s) => s.showRetail);
  const onlyConfirmed = useApp((s) => s.onlyConfirmed);
  const showTerminals = useApp((s) => s.showTerminals);
  const setPrefs = useApp((s) => s.setPrefs);
  const close = useApp((s) => s.closePanel);

  return (
    <BottomSheet
      label={t("title")}
      onClose={close}
      initial="half"
      drawerOnDesktop={false}
      header={
        <div className="sheet-header">
          <h2 className="heading grow">{t("title")}</h2>
          <button type="button" className="btn btn-icon btn-ghost" aria-label="Tutup" onClick={close}>
            <Icon name="close" />
          </button>
        </div>
      }
    >
      <label className="switch">
        <span>{t("retail")}</span>
        <input type="checkbox" checked={showRetail} onChange={(e) => setPrefs({ showRetail: e.target.checked })} />
      </label>
      <label className="switch">
        <span>{t("onlyConfirmed")}</span>
        <input type="checkbox" checked={onlyConfirmed} onChange={(e) => setPrefs({ onlyConfirmed: e.target.checked })} />
      </label>
      <label className="switch">
        <span>{t("terminal")}</span>
        <input type="checkbox" checked={showTerminals} onChange={(e) => setPrefs({ showTerminals: e.target.checked })} />
      </label>
    </BottomSheet>
  );
}
