"use client";
import { useTranslations } from "next-intl";
import { FAVORITES_MAX, useFavorites } from "@/lib/favorites";
import { useApp } from "@/lib/store";
import { Icon } from "../common/Icon";

/** Simpan SPBU sebagai favorit (tersimpan di perangkat). Perubahan statusnya diberitahukan saat aplikasi dibuka. */
export function FavoriteButton({ id }: { id: string }) {
  const t = useTranslations("more");
  const on = useFavorites((s) => s.ids.includes(id));
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost"
      aria-pressed={on}
      aria-label={on ? t("favRemove") : t("favAdd")}
      onClick={() => {
        const ok = useFavorites.getState().toggle(id);
        const { showToast } = useApp.getState();
        if (!ok) showToast(t("favLimit", { n: FAVORITES_MAX }));
        else showToast(on ? t("favRemoved") : t("favAdded"));
      }}
    >
      <Icon name="heart" style={on ? { fill: "currentColor", color: "var(--status-empty)" } : undefined} />
    </button>
  );
}
