// Pembungkus RPC bertipe. Nama dan parameter sama persis dengan fungsi di migrasi 0004.
import type { FuelAvailability, PlaceTuple, QueueLevel, RpcResult, VoteType } from "@wenten/core";

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

export interface SuggestPlaceArgs {
  p_kind: "retailer" | "pertashop";
  p_name: string | null;
  p_address: string | null;
  p_lat: number;
  p_lng: number;
  p_fuels: number[];
}

export interface PositionArgs {
  p_lat: number;
  p_lng: number;
  p_accuracy_m: number;
}

export type CorrectionKind = "wrong_location" | "closed" | "wrong_fuels" | "duplicate" | "other";
export type QueueEndReason = "got_fuel" | "left" | "empty";

export interface RpcMap {
  queue_my_session: { args: Record<string, never>; result: { id: string; station_id: string; fuel_type_id: number | null; started_at: string } | null };
  queue_join: {
    args: PositionArgs & { p_station_id: string; p_fuel_type_id: number | null };
    result: RpcResult<{ session_id: string; started_at: string }>;
  };
  queue_ping: { args: { p_session_id: string; p_lat: number; p_lng: number }; result: { ok: boolean; open?: boolean } };
  queue_leave: {
    args: { p_session_id: string; p_reason: QueueEndReason; p_lat?: number | null; p_lng?: number | null; p_accuracy_m?: number | null };
    result: RpcResult<{ wait_minutes: number; reported: boolean }>;
  };
  suggest_correction: {
    args: { p_station_id: string; p_kind: CorrectionKind; p_lat?: number | null; p_lng?: number | null; p_note?: string | null };
    result: RpcResult<{ duplicate?: boolean }>;
  };
  submit_price: { args: PositionArgs & { p_station_id: string; p_fuel_type_id: number; p_price: number }; result: RpcResult };
  station_prices: { args: { p_station_id: string }; result: [number, number, number, string][] };

  suggest_place: {
    args: SuggestPlaceArgs;
    result: RpcResult<{ id: string; status: "approved" | "quarantined"; place: PlaceTuple }>;
  };
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
