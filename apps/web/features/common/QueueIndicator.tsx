"use client";
import { Icon } from "@/features/common/Icon";
import type { QueueLevel } from "@wenten/core";
import { useTranslations } from "next-intl";

const COUNT: Record<QueueLevel, number> = { none: 0, short: 1, medium: 2, long: 3 };

export function QueueIndicator({ level }: { level: QueueLevel | null }) {
  const t = useTranslations("queue");
  if (!level) return <span className="muted">{t("unknown")}</span>;
  return (
    <span className="status-inline">
      {Array.from({ length: COUNT[level] }, (_, i) => (
        <Icon key={i} name="car" size={14} />
      ))}
      {t(level)}
    </span>
  );
}
