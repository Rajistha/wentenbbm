"use client";
import dynamic from "next/dynamic";

// Panel admin tidak dimuat untuk pengunjung biasa
const AdminApp = dynamic(() => import("@/features/admin/AdminApp").then((m) => m.AdminApp), { ssr: false });

export function AdminClient() {
  return <AdminApp />;
}
