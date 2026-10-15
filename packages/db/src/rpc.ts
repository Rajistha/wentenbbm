// Pembungkus RPC bertipe. Nama dan parameter sama persis dengan fungsi di migrasi 0004.
import type { FuelAvailability, QueueLevel, RpcResult, VoteType } from "@wenten/core";

export interface SubmitReportArgs {
  p_station_id: string;
  p_lat: number;
  p_lng: number;
  p_accuracy_m: number;
  p_items: { fuel_type_id: number; availability: FuelAvailability }[];
  p_queue_level?: QueueLevel | null;
  p_wait_minutes?: number | null;
  p_note?: string | null;
}

export interface CastVoteArgs {
  p_report_id: string;
  p_vote: VoteType;
  p_lat: number;
  p_lng: number;
  p_accuracy_m: number;
}

export interface RpcMap {
  submit_report: { args: SubmitReportArgs; result: RpcResult<{ report_id: string }> };
  cast_vote: { args: CastVoteArgs; result: RpcResult<{ confirms: number; disputes: number }> };
  register_visit: { args: { p_device?: string }; result: { ok: boolean } };
  station_recent_reports: { args: { p_station_id: string; p_limit?: number }; result: RawRecentReport[] };
}

export interface RawRecentReport {
  id: string;
  created_at: string;
  queue: QueueLevel | null;
  wait_minutes: number | null;
  note: string | null;
  items: { fuel_type_id: number; availability: FuelAvailability }[];
  confirms: number;
  disputes: number;
  is_mine: boolean;
  my_vote: VoteType | null;
}

export type RpcName = keyof RpcMap;
