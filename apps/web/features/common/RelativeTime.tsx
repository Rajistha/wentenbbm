"use client";
import { formatRelative, formatWita, type Locale } from "@wenten/core";
import { useLocale } from "next-intl";
import { useState } from "react";
import { useTicker } from "@/lib/ticker";

/** "12 mnt lalu", ketuk untuk jam WITA, diperbarui tiap 30 detik (DESIGN.md 7.8). */
export function RelativeTime({ at, className }: { at: string; className?: string }) {
  const locale = useLocale() as Locale;
  const now = useTicker();
  const [absolute, setAbsolute] = useState(false);
  return (
    <time
      dateTime={at}
      title={formatWita(at, locale, true)}
      className={`tnum ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setAbsolute((v) => !v);
      }}
      style={{ cursor: "pointer" }}
    >
      {absolute ? formatWita(at, locale) : formatRelative(at, locale, now)}
    </time>
  );
}

/** Jam sekarang yang berdetak, untuk perhitungan kesegaran. */
export function useNow(_intervalMs?: number) {
  return useTicker();
}
