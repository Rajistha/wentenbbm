-- Usulan koreksi dari warga: lokasi salah, sudah tutup, BBM salah, duplikat, lainnya. Masuk antrean admin (0013).
set search_path = public, extensions;

create or replace function suggest_correction(
  p_station_id uuid,
  p_kind correction_kind,
  p_lat double precision default null,
  p_lng double precision default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid     uuid := auth.uid();
  v_profile profiles;
  v_station stations;
  v_pt      geography;
  v_note    text := left(nullif(trim(p_note), ''), 280);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;
  if setting_bool('read_only') then
    return jsonb_build_object('ok', false, 'code', 'READ_ONLY');
  end if;
  v_profile := ensure_profile(v_uid);
  if v_profile.is_blocked then
    return jsonb_build_object('ok', false, 'code', 'BLOCKED');
  end if;
  select * into v_station from stations where id = p_station_id and is_active and moderation_status = 'approved';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STATION_NOT_FOUND');
  end if;
  if p_kind = 'wrong_location' then
    if p_lat is null or p_lng is null or p_lat not between -9.2 and -7.9 or p_lng not between 114.3 and 115.8 then
      return jsonb_build_object('ok', false, 'code', 'OUT_OF_BOUNDS');
    end if;
    v_pt := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
    if st_distance(v_station.location, v_pt) < 20 then
      return jsonb_build_object('ok', false, 'code', 'TOO_CLOSE');
    end if;
  elsif p_kind = 'other' and v_note is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PLACE');
  end if;
  if (select count(*) from station_corrections where proposed_by = v_uid and created_at > now() - interval '1 day') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'PLACE_LIMIT');
  end if;
  if exists (select 1 from station_corrections
              where proposed_by = v_uid and station_id = p_station_id and kind = p_kind and status = 'pending') then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into station_corrections (station_id, proposed_by, kind, proposed_location, note)
  values (p_station_id, v_uid, p_kind, v_pt, v_note);
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function suggest_correction(uuid, correction_kind, double precision, double precision, text) from public, anon;
grant execute on function suggest_correction(uuid, correction_kind, double precision, double precision, text) to authenticated;
