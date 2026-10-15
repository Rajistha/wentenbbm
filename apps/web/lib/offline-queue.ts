"use client";
import type { SubmitReportArgs } from "@wenten/db/rpc";
import { callRpc } from "./backend/client";
import { idbGet, idbSet } from "./idb";

// PRD US-05: laporan yang gagal karena jaringan dikirim ulang otomatis maksimal 10 menit, lalu dibuang.
const KEY = "pending-reports";
const TTL_MS = 10 * 60_000;

interface Pending {
  args: SubmitReportArgs;
  queuedAt: number;
}

export async function queueOfflineReport(args: SubmitReportArgs) {
  const list = (await idbGet<Pending[]>(KEY)) ?? [];
  list.push({ args, queuedAt: Date.now() });
  await idbSet(KEY, list);
}

let flushing = false;
export async function flushOfflineReports(): Promise<number> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  flushing = true;
  try {
    const list = ((await idbGet<Pending[]>(KEY)) ?? []).filter((p) => Date.now() - p.queuedAt < TTL_MS);
    const remaining: Pending[] = [];
    let sent = 0;
    for (const p of list) {
      try {
        await callRpc("submit_report", p.args);
        sent++;
      } catch {
        remaining.push(p);
      }
    }
    await idbSet(KEY, remaining);
    return sent;
  } finally {
    flushing = false;
  }
}
