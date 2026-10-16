-- Tambah tempat dari warga: Pertamini, Pertashop, dan pengecer (PRD US-14).
-- Pemeriksaan otomatis di server: di dalam Bali, tidak terlalu dekat titik lain (50 m), batas harian per
-- perangkat, dan berada dekat SPBU yang sudah dikenal (di luar itu masuk karantina untuk dimoderasi).
set search_path = public, extensions;

insert into app_settings (key, value, description) values
  ('place_daily_limit',      '3',    'Maks tempat baru per perangkat per 24 jam'),
  ('place_min_distance_m',   '50',   'Jarak minimal tempat baru dari titik lain (meter)'),
  ('place_max_from_known_m', '3000', 'Maks jarak dari SPBU terdekat agar otomatis disetujui (meter)')
on conflict (key) do nothing;

create or replace function suggest_place(
  p_kind    place_kind,
  p_name    text,
  p_address text,
  p_lat     double precision,
  p_lng     double precision,
  p_fuels   jsonb default '[]'
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_uid     uuid := auth.uid();
  v_ip      text := private.request_ip_hash();
  v_profile profiles;
  v_pt      geography;
  v_close   record;
  v_near    record;
  v_status  moderation_status := 'approved';
  v_name    text;
  v_slug    text;
  v_id      uuid := gen_random_uuid();
  v_fuels   smallint[];
  v_region  smallint;
  v_addr    text := left(nullif(trim(p_address), ''), 120);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;
  if setting_bool('read_only') then
    return jsonb_build_object('ok', false, 'code', 'READ_ONLY');
  end if;

  v_profile := ensure_profile(v_uid);
  if v_profile.is_blocked then
    perform log_abuse(v_uid, v_ip, 'blocked_profile', null, null);
    return jsonb_build_object('ok', false, 'code', 'BLOCKED');
  end if;

  if p_kind not in ('retailer', 'pertashop') or p_lat is null or p_lng is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PLACE');
  end if;
  if p_lat not between -8.88 and -8.03 or p_lng not between 114.4 and 115.75 then
    return jsonb_build_object('ok', false, 'code', 'OUT_OF_BOUNDS');
  end if;
  v_pt := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

  if (select count(*) from stations
       where created_by = v_uid and created_at > now() - interval '24 hours')
     >= setting_num('place_daily_limit') then
    perform log_abuse(v_uid, v_ip, 'place_rejected', null, jsonb_build_object('reason', 'daily_limit'));
    return jsonb_build_object('ok', false, 'code', 'PLACE_LIMIT');
  end if;

  -- Terlalu dekat dengan titik yang sudah ada
  select s.name, st_distance(s.location, v_pt) as d into v_close
    from stations s
   where s.is_active and s.moderation_status = 'approved'
     and st_dwithin(s.location, v_pt, setting_num('place_min_distance_m'))
   order by s.location <-> v_pt
   limit 1;
  if found then
    perform log_abuse(v_uid, v_ip, 'place_rejected', null, jsonb_build_object('reason', 'too_close'));
    return jsonb_build_object('ok', false, 'code', 'TOO_CLOSE',
                              'near_name', v_close.name, 'distance_m', round(v_close.d));
  end if;

  -- Wilayah dan kedekatan dengan SPBU yang sudah dikenal
  select s.region_id, st_distance(s.location, v_pt) as d into v_near
    from stations s
   where s.is_active and s.moderation_status = 'approved'
   order by s.location <-> v_pt
   limit 1;
  v_region := v_near.region_id;
  if v_near.d is null or v_near.d > setting_num('place_max_from_known_m') then
    v_status := 'quarantined';
  end if;

  -- Jenis BBM: hanya produk Pertamina, bawaan Pertalite
  select array_agg(distinct x::smallint) into v_fuels
    from jsonb_array_elements_text(coalesce(p_fuels, '[]'::jsonb)) x
   where x ~ '^[0-9]{1,3}$'
     and x::smallint in (select id from fuel_types where brand = 'pertamina');
  if v_fuels is null or cardinality(v_fuels) = 0 then
    v_fuels := array[1]::smallint[];
  end if;

  -- Nama: awali dengan jenis bila belum ada
  v_name := left(nullif(trim(p_name), ''), 60);
  if p_kind = 'retailer' then
    v_name := case when v_name is null then 'Pertamini'
                   when v_name ~* 'pertamini|petramini|pengecer|eceran|pom mini' then v_name
                   else 'Pertamini ' || v_name end;
  else
    v_name := case when v_name is null then 'Pertashop'
                   when v_name ~* 'pertashop' then v_name
                   else 'Pertashop ' || v_name end;
  end if;
  v_slug := trim(both '-' from lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g')))
            || '-' || substr(replace(v_id::text, '-', ''), 1, 5);

  insert into stations (id, slug, kind, brand, name, address, region_id, location,
                        is_24h, is_active, source, moderation_status, created_by)
  values (v_id, v_slug, p_kind,
          case when p_kind = 'pertashop' then 'pertamina'::brand_type else 'none'::brand_type end,
          v_name, v_addr, v_region, v_pt, false, true, 'user', v_status, v_uid);

  insert into station_fuels (station_id, fuel_type_id)
  select v_id, f from unnest(v_fuels) f;

  update profiles set last_active_at = now() where id = v_uid;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'status', v_status,
    'place', jsonb_build_array(v_id, v_slug, p_kind,
               case when p_kind = 'pertashop' then 'pertamina' else 'none' end,
               null, v_name, round(p_lat::numeric, 6), round(p_lng::numeric, 6),
               v_region, false, to_jsonb(v_fuels), v_addr));
end;
$$;

revoke execute on function suggest_place(place_kind, text, text, double precision, double precision, jsonb) from public, anon;
grant execute on function suggest_place(place_kind, text, text, double precision, double precision, jsonb) to authenticated;
