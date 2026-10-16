import type { RpcErrorCode } from "@wenten/core";

type T = (key: string, values?: Record<string, string | number>) => string;

/** Pesan kesalahan RPC. PLACE_LIMIT dipakai banyak fitur, jadi teksnya dibuat umum di luar Tambah Tempat. */
export function rpcErrorText(t: T, code: RpcErrorCode, distance = "") {
  if (code === "PLACE_LIMIT") return t("more.limitDaily");
  return t(`errors.${code}`, { d: distance, name: "" });
}
