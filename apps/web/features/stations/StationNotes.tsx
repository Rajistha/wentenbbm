"use client";
import { Icon } from "@/features/common/Icon";
import { openingState, type Place, type StationStatus } from "@wenten/core";
import { useTranslations } from "next-intl";
import { useNow } from "../common/RelativeTime";

/** Di bawah ini jumlah laporan dianggap "tipis": status bisa meleset. */
const FEW_REPORTS = 3;

/** Jam buka (hanya bila tercatat) dan badge "Ditambahkan warga". */
export function OpeningNote({ place }: { place: Place }) {
  const t = useTranslations("detail");
  const now = useNow();
  const st = openingState(place, now);
  if (!st && !place.byUser) return null;
  const text =
    st?.kind === "h24" ? t("h24") : st?.kind === "open" ? t("openUntil", { time: st.closesAt }) : st?.kind === "closed" ? t("closedUntil", { time: st.opensAt }) : null;
  return (
    <>
      {text && (
        <div className="sc-meta">
          <Icon name="clock" size={13} /> {text}
        </div>
      )}
      {place.byUser && (
        <div className="sc-meta">
          <Icon name="users" size={13} /> {t("byUser")}
        </div>
      )}
    </>
  );
}

/** Jumlah laporan 3 jam terakhir, dengan peringatan bila baru sedikit. Tersembunyi bila server belum mengirim angkanya. */
export function ReportCountNote({ status }: { status: StationStatus | undefined }) {
  const t = useTranslations("detail");
  const n = status?.reports3h;
  if (n == null || n <= 0) return null;
  return (
    <>
      <span>{t("reports3h", { n })}</span>
      {n < FEW_REPORTS && (
        <span className="meta-warn">
          <Icon name="alert" size={13} /> {t("fewReports", { n })}
        </span>
      )}
    </>
  );
}
