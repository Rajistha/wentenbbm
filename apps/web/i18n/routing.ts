import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",
  localePrefix: "as-needed",
  // Selalu buka dalam bahasa Indonesia, tidak mengikuti bahasa browser.
  // Pengguna tetap bisa memilih English lewat tombol ID/EN, pilihannya diingat di perangkat.
  localeDetection: false,
});
