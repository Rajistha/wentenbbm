-- Tes pgTAP minimal logika status (ARCHITECTURE.md bagian 8). Jalankan: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

-- Persiapan: satu SPBU uji di Denpasar dan SPBU kedua 40 km jauhnya
insert into stations (id, slug, name, region_id, location) values
  ('00000000-0000-0000-0000-0000000000a1', 'uji-a', 'SPBU Uji A', 1,
   st_setsrid(st_makepoint(115.2126, -8.6705), 4326)::geography),
  ('00000000-0000-0000-0000-0000000000b2', 'uji-b', 'SPBU Uji B', 6,
   st_setsrid(st_makepoint(115.0900, -8.3300), 4326)::geography);
insert into station_fuels values
  ('00000000-0000-0000-0000-0000000000a1', 1), ('00000000-0000-0000-0000-0000000000a1', 2),
  ('00000000-0000-0000-0000-0000000000b2', 1);

insert into auth.users (id, instance_id, aud, role, email, is_anonymous) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true);
select ensure_profile('00000000-0000-0000-0000-000000000001');
select ensure_profile('00000000-0000-0000-0000-000000000002');
select ensure_profile('00000000-0000-0000-0000-000000000003');

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.add_report(p_station uuid, p_user uuid, p_fuel int, p_av fuel_availability,
                                   p_age interval, p_status moderation_status default 'active')
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into reports (station_id, reporter_id, distance_m, accuracy_m, created_at, moderation_status)
  values (p_station, p_user, 20, 10, now() - p_age, p_status) returning id into v;
  insert into report_items values (v, p_fuel, p_av);
  return v;
end $$;

create function pg_temp.fuel_status(p_station uuid, p_fuel int) returns fuel_status language sql as $$
  select status from station_fuel_status where station_id = p_station and fuel_type_id = p_fuel;
$$;

-- 1. Satu laporan "Ada" baru menghasilkan available dengan confidence 1
select pg_temp.add_report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 1, 'available', '0 min');
select recompute_station_status('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.fuel_status('00000000-0000-0000-0000-0000000000a1', 1), 'available', '1 laporan Ada baru = available');
select is((select confidence from station_fuel_status
            where station_id = '00000000-0000-0000-0000-0000000000a1' and fuel_type_id = 1), 1.00::numeric, 'confidence 1');

-- 2. "Ada" 45 menit lalu dan "Habis" 5 menit lalu menghasilkan empty
delete from reports;
select pg_temp.add_report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 1, 'available', '45 min');
select pg_temp.add_report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 1, 'empty', '5 min');
select recompute_station_status('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.fuel_status('00000000-0000-0000-0000-0000000000a1', 1), 'empty', 'laporan Habis yang lebih baru menang');

-- 3. Satu laporan 100 menit lalu menghasilkan unknown
delete from reports;
select pg_temp.add_report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 1, 'available', '100 min');
select recompute_station_status('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.fuel_status('00000000-0000-0000-0000-0000000000a1', 1), 'unknown', 'laporan 100 menit memudar');

-- 4. Dua pelapor berbeda sepakat dalam 30 menit menghasilkan is_confirmed
delete from reports;
select pg_temp.add_report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 1, 'available', '10 min');
select pg_temp.add_report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 1, 'available', '2 min');
select recompute_station_status('00000000-0000-0000-0000-0000000000a1');
select ok((select is_confirmed from station_status where station_id = '00000000-0000-0000-0000-0000000000a1'),
          'dua pelapor sepakat = dikonfirmasi warga');

-- 5. Laporan dikarantina tidak memengaruhi status
delete from reports;
select pg_temp.add_report('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 1, 'available', '1 min', 'quarantined');
select recompute_station_status('00000000-0000-0000-0000-0000000000a1');
select is(pg_temp.fuel_status('00000000-0000-0000-0000-0000000000a1', 1), 'unknown', 'karantina diabaikan');

-- 6. Geofence menolak 301 m dan menerima 299 m (1 derajat lintang ~ 110,6 km di -8,67)
delete from reports;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select is(
  (submit_report('00000000-0000-0000-0000-0000000000a1', -8.6705 - 301.5 / 110590.0, 115.2126, 10,
                 '[{"fuel_type_id":1,"availability":"available"}]'::jsonb))->>'code',
  'OUT_OF_RANGE', 'geofence menolak 301 m');
select is(
  (submit_report('00000000-0000-0000-0000-0000000000a1', -8.6705 - 298.5 / 110590.0, 115.2126, 10,
                 '[{"fuel_type_id":1,"availability":"available"}]'::jsonb))->>'ok',
  'true', 'geofence menerima 299 m');

-- 7. Laporan kedua di SPBU sama dalam 30 menit ditolak
select is(
  (submit_report('00000000-0000-0000-0000-0000000000a1', -8.6705, 115.2126, 10,
                 '[{"fuel_type_id":2,"availability":"empty"}]'::jsonb))->>'code',
  'RATE_LIMIT_STATION', 'jeda 30 menit per SPBU');

-- 8. Perangkat yang 10 menit sebelumnya melapor dari SPBU berjarak 40 km masuk karantina
select pg_temp.as_user('00000000-0000-0000-0000-000000000003');
select pg_temp.add_report('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000003', 1, 'available', '10 min');
select submit_report('00000000-0000-0000-0000-0000000000a1', -8.6705, 115.2126, 10,
                     '[{"fuel_type_id":1,"availability":"empty"}]'::jsonb);
select is((select moderation_status from reports
            where reporter_id = '00000000-0000-0000-0000-000000000003'
            order by created_at desc limit 1),
          'quarantined'::moderation_status, 'perjalanan mustahil dikarantina');

select * from finish();
rollback;
