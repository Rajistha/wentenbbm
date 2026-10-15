"use client";
import type { RpcErrorCode } from "@wenten/core";
import type { RpcMap, RpcName } from "@wenten/db/rpc";
import { demoDeviceId, ensureSession } from "@/features/session/ensure-session";
import { IS_DEMO } from "../env";
import { getSupabase } from "../supabase/client";

export class RpcError extends Error {
  constructor(public code: RpcErrorCode) {
    super(code);
  }
}

const NEEDS_SESSION: RpcName[] = ["submit_report", "cast_vote"];

/** Panggil fungsi RPC: Supabase di produksi, /api/demo/rpc di mode demo. */
export async function callRpc<N extends RpcName>(name: N, args: RpcMap[N]["args"]): Promise<RpcMap[N]["result"]> {
  try {
    if (IS_DEMO) {
      const res = await fetch(`/api/demo/rpc/${name}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-device": demoDeviceId() },
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new RpcError("NETWORK");
      return (await res.json()) as RpcMap[N]["result"];
    }
    const supabase = await getSupabase();
    if (NEEDS_SESSION.includes(name)) await ensureSession(supabase);
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new RpcError("NETWORK");
    return data as RpcMap[N]["result"];
  } catch (err) {
    if (err instanceof RpcError) throw err;
    throw new RpcError("NETWORK");
  }
}
