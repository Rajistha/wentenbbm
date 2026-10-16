-- Harga BBM per jenis dari warga di lokasi (opsional). Ditampilkan sebagai median laporan 7 hari terakhir
-- agar satu angka salah tidak langsung terlihat.
set search_path = public, extensions;

create table if not exists station_prices (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  fuel_type_id smallint not null references fuel_types(id),
  price_rp integer not null check (price_rp between 3000 and 60000),
  reporter_id uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists station_prices_idx on station_prices (station_id, fuel_type_id, created_at desc);
alter table station_prices enable row level security;
revoke all on table station_prices from anon, authenticated;

create or replace function submit_price(
  p_station_id uuid, p_fuel_type_id smallint, p_price integer,
  p_lat double precision, p_lng double precision, p_accuracy_m real
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid     uuid := auth.uid();
  v_profile profiles;
  v_station stations;
  v_dist    real;
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
  if p_price is null or p_price not between 3000 and 60000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS');
  end if;
  select * into v_station from stations
   where id = p_station_id and is_active and moderation_status = 'approved' and kind <> 'terminal';
  if not found or not exists (select 1 from station_fuels where station_id = p_station_id and fuel_type_id = p_fuel_type_id) then
    return jsonb_build_object('ok', false, 'code', 'STATION_NOT_FOUND');
  end if;
  if p_accuracy_m is null or p_accuracy_m > setting_num('max_accuracy_m') then
    return jsonb_build_object('ok', false, 'code', 'LOW_ACCURACY');
  end if;
  v_dist := st_distance(v_station.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
  if v_dist > setting_num('geofence_m') then
    return jsonb_build_object('ok', false, 'code', 'OUT_OF_RANGE', 'distance_m', round(v_dist));
  end if;
  -- Satu harga per pengguna per BBM per SPBU per 6 jam; maksimal 20 harga per jam
  if exists (select 1 from station_prices where reporter_id = v_uid and station_id = p_station_id
                and fuel_type_id = p_fuel_type_id and created_at > now() - interval '6 hours')
     or (select count(*) from station_prices where reporter_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMIT_STATION');
  end if;
  insert into station_prices (station_id, fuel_type_id, price_rp, reporter_id)
  values (p_station_id, p_fuel_type_id, p_price, v_uid);
  return jsonb_build_object('ok', true);
end;
$$;

-- [[fuel_type_id, harga median, jumlah laporan, laporan terakhir]] untuk satu SPBU
create or replace function station_prices(p_station_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_array(fuel_type_id, price, n, last_at) order by fuel_type_id), '[]'::jsonb)
    from (
      select fuel_type_id,
             round(percentile_cont(0.5) within group (order by price_rp))::int as price,
             count(*) as n, max(created_at) as last_at
        from (
          select *, row_number() over (partition by fuel_type_id order by created_at desc) as rn
            from station_prices
           where station_id = p_station_id and created_at > now() - interval '7 days'
        ) x
       where rn <= 5
       group by fuel_type_id
    ) y
$$;

select cron.schedule('prices-retention', '40 19 * * *',
  $$delete from public.station_prices where created_at < now() - interval '30 days'$$);

revoke execute on function submit_price(uuid, smallint, integer, double precision, double precision, real) from public, anon;
grant execute on function submit_price(uuid, smallint, integer, double precision, double precision, real) to authenticated;
revoke execute on function station_prices(uuid) from public;
grant execute on function station_prices(uuid) to anon, authenticated;
