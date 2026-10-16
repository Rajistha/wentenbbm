import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdminClient } from "./client";

export const metadata: Metadata = {
  title: "Admin | Wenten BBM",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminClient />;
}
