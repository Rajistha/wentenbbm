-- ===== 0001_extensions.sql =====
-- Ekstensi dan skema privat (ARCHITECTURE.md 4.4)
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;


-- ===== 0002_schema.sql =====
-- Skema inti, disalin dari ERD.md bagian 5 (sumber kebenaran ada di ERD).
set search_path = public, extensions;

-- Enum
create type region_kind as enum ('kabupaten','kota');
create type place_kind as enum ('spbu','pertashop','retailer','terminal');
create type brand_type as enum ('pertamina','shell','bp','vivo','other','none');
create type place_source as enum ('osm','admin','user');
create type moderation_status as enum ('approved','active','pending','quarantined','hidden','rejected');
create type fuel_category as enum ('bensin','diesel');
create type fuel_availability as enum ('available','limited','empty');
create type fuel_status as enum ('available','limited','empty','unknown');
create type queue_level as enum ('none','short','medium','long');
create type vote_type as enum ('confirm','dispute');
create type app_role as enum ('anonymous','citizen','volunteer','operator','admin');
create type announcement_level as enum ('info','important');
create type correction_kind as enum ('wrong_location','closed','wrong_fuels','duplicate','other');
create type abuse_kind as enum ('out_of_range','low_accuracy','rate_limit_station','rate_limit_hourly',
  'burst_quarantine','blocked_profile','place_rejected','message_flagged');
create type queue_end_reason as enum ('got_fuel','left','timeout');
create type incident_kind as enum ('spam','partial','down','maintenance');
create type uptime_target as enum ('site','snapshot','database','realtime');

-- Referensi
create table regions (
  id smallint primary key,
  slug text not null unique,
  name text not null,
  kind region_kind not null
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null default 'anonymous',
  pseudonym text not null,
  trust_score numeric(3,2) not null default 1.00 check (trust_score between 0 and 2),
  report_count integer not null default 0,
  confirmed_count integer not null default 0,
  disputed_count integer not null default 0,
  is_blocked boolean not null default false,
  blocked_reason text,
  signup_ip_hash text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create table stations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind place_kind not null default 'spbu',
  brand brand_type not null default 'pertamina',
  spbu_code text unique,
  name text not null,
  address text,
  region_id smallint references regions(id),
  location geography(Point, 4326) not null,
  is_24h boolean not null default false,
  is_active boolean not null default true,
  source place_source not null default 'osm',
  osm_id bigint unique,
  moderation_status moderation_status not null default 'approved',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index stations_location_gix on stations using gist (location);
create index stations_region_idx on stations (region_id);
create index stations_public_idx on stations (kind) where is_active and moderation_status = 'approved';

create table fuel_types (
  id smallint primary key,
  code text not null unique,
  name text not null,
  brand brand_type not null,
  category fuel_category not null,
  ron smallint,
  is_subsidized boolean not null default false,
  is_filter_tab boolean not null default false,
  sort_order smallint not null default 100
);

create table station_fuels (
  station_id uuid references stations(id) on delete cascade,
  fuel_type_id smallint references fuel_types(id),
  primary key (station_id, fuel_type_id)
);

-- Laporan
create table reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  reporter_id uuid not null references profiles(id),
  queue_level queue_level,
  wait_minutes smallint check (wait_minutes between 0 and 600),
  note text check (char_length(note) <= 140),
  photo_path text,
  reporter_location geography(Point, 4326),
  distance_m real not null,
  accuracy_m real not null,
  moderation_status moderation_status not null default 'active',
  quarantine_reason text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index reports_station_time_idx on reports (station_id, created_at desc)
  where moderation_status = 'active';
create index reports_reporter_time_idx on reports (reporter_id, created_at desc);
create index reports_ip_time_idx on reports (ip_hash, created_at desc);
create index reports_time_brin on reports using brin (created_at);

create table report_items (
  report_id uuid references reports(id) on delete cascade,
  fuel_type_id smallint references fuel_types(id),
  availability fuel_availability not null,
  primary key (report_id, fuel_type_id)
);

create table report_votes (
  report_id uuid references reports(id) on delete cascade,
  voter_id uuid references profiles(id),
  vote vote_type not null,
  distance_m real not null,
  created_at timestamptz not null default now(),
  primary key (report_id, voter_id)
);

-- Status hasil hitung
create table station_fuel_status (
  station_id uuid references stations(id) on delete cascade,
  fuel_type_id smallint references fuel_types(id),
  status fuel_status not null default 'unknown',
  confidence numeric(3,2) not null default 0,
  is_confirmed boolean not null default false,
  last_report_at timestamptz,
  report_count smallint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (station_id, fuel_type_id)
);

create table station_status (
  station_id uuid primary key references stations(id) on delete cascade,
  overall_status fuel_status not null default 'unknown',
  is_confirmed boolean not null default false,
  queue_level queue_level,
  wait_min_low smallint,
  wait_min_high smallint,
  active_queuers smallint not null default 0,
  last_report_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Konten dan moderasi
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  level announcement_level not null default 'info',
  region_id smallint references regions(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table station_corrections (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  proposed_by uuid not null references profiles(id),
  kind correction_kind not null,
  proposed_location geography(Point, 4326),
  note text check (char_length(note) <= 280),
  status moderation_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table station_operators (
  station_id uuid references stations(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  primary key (station_id, profile_id)
);

create table abuse_events (
  id bigint generated always as identity primary key,
  profile_id uuid references profiles(id),
  ip_hash text,
  kind abuse_kind not null,
  station_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index abuse_events_time_idx on abuse_events (created_at desc);
create index abuse_events_profile_idx on abuse_events (profile_id, created_at desc);

create table admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references profiles(id),
  action text not null,
  target_table text not null,
  target_id text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

-- Antrean (P1)
create table queue_sessions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  fuel_type_id smallint references fuel_types(id),
  profile_id uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  start_distance_m real not null,
  last_distance_m real not null,
  end_reason queue_end_reason,
  wait_minutes smallint
);
create unique index queue_sessions_one_open on queue_sessions (profile_id) where ended_at is null;
create index queue_sessions_station_idx on queue_sessions (station_id, started_at desc);

create table queue_pings (
  session_id uuid references queue_sessions(id) on delete cascade,
  at timestamptz not null default now(),
  distance_m real not null,
  primary key (session_id, at)
);

create table queue_messages (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references stations(id) on delete cascade,
  profile_id uuid not null references profiles(id),
  body text not null check (char_length(body) between 1 and 100),
  flag_count smallint not null default 0,
  moderation_status moderation_status not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);
create index queue_messages_station_idx on queue_messages (station_id, created_at desc)
  where moderation_status = 'active';

-- Halaman data
create table report_stats_hourly (
  hour timestamptz primary key,
  reports_accepted integer not null default 0,
  reporters_unique integer not null default 0,
  items_available integer not null default 0,
  items_limited integer not null default 0,
  items_empty integer not null default 0,
  rejected_out_of_range integer not null default 0,
  rejected_rate_limit integer not null default 0,
  rejected_other integer not null default 0,
  quarantined_reports integer not null default 0,
  quarantined_places integer not null default 0,
  wait_median_min smallint
);

create table site_metrics_hourly (
  hour timestamptz primary key,
  unique_visitors integer not null default 0,
  pageviews integer not null default 0,
  peak_online integer not null default 0
);

create table site_metrics_live (
  id smallint primary key default 1 check (id = 1),
  online_now integer not null default 0,
  visitors_total bigint not null default 0,
  launched_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table uptime_checks (
  id bigint generated always as identity primary key,
  target uptime_target not null,
  ok boolean not null,
  status_code smallint,
  latency_ms integer,
  checked_at timestamptz not null default now()
);
create index uptime_checks_time_idx on uptime_checks (target, checked_at desc);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  kind incident_kind not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  title text not null,
  body text not null,
  is_public boolean not null default true,
  created_by uuid references profiles(id)
);

-- Kondisi sekarang per wilayah, untuk /data
create view region_status_now as
select s.region_id,
       sfs.fuel_type_id,
       count(*) filter (where sfs.status = 'available') as available,
       count(*) filter (where sfs.status = 'limited')   as limited,
       count(*) filter (where sfs.status = 'empty')     as empty,
       count(*) filter (where sfs.status = 'unknown')   as unknown
from stations s
join station_fuel_status sfs on sfs.station_id = s.id
where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
group by s.region_id, sfs.fuel_type_id;


-- ===== 0003_reference_data.sql =====
-- Data referensi yang wajib ada di semua lingkungan (ERD.md bagian 6).

insert into regions (id, slug, name, kind) values
 (1,'denpasar','Kota Denpasar','kota'),
 (2,'badung','Badung','kabupaten'),
 (3,'gianyar','Gianyar','kabupaten'),
 (4,'tabanan','Tabanan','kabupaten'),
 (5,'jembrana','Jembrana','kabupaten'),
 (6,'buleleng','Buleleng','kabupaten'),
 (7,'bangli','Bangli','kabupaten'),
 (8,'klungkung','Klungkung','kabupaten'),
 (9,'karangasem','Karangasem','kabupaten');

-- id 1-9 Pertamina, 11+ Shell, 21+ BP, 31+ Vivo
insert into fuel_types (id, code, name, brand, category, ron, is_subsidized, is_filter_tab, sort_order) values
 (1,  'pertalite',         'Pertalite',          'pertamina', 'bensin', 90, true,  true,  1),
 (2,  'pertamax',          'Pertamax',           'pertamina', 'bensin', 92, false, true,  2),
 (3,  'pertamax_turbo',    'Pertamax Turbo',     'pertamina', 'bensin', 98, false, false, 4),
 (4,  'pertamax_green',    'Pertamax Green',     'pertamina', 'bensin', 95, false, false, 5),
 (5,  'biosolar',          'Solar',              'pertamina', 'diesel', null, true, true,  3),
 (6,  'dexlite',           'Dexlite',            'pertamina', 'diesel', null, false, false, 6),
 (7,  'pertamina_dex',     'Pertamina Dex',      'pertamina', 'diesel', null, false, false, 7),
 (11, 'shell_super',       'Shell Super',        'shell',     'bensin', 92, false, false, 20),
 (12, 'shell_vpower',      'Shell V-Power',      'shell',     'bensin', 95, false, false, 21),
 (13, 'shell_vpower_diesel','Shell V-Power Diesel','shell',   'diesel', null, false, false, 22),
 (21, 'bp_92',             'BP 92',              'bp',        'bensin', 92, false, false, 30),
 (22, 'bp_ultimate',       'BP Ultimate',        'bp',        'bensin', 95, false, false, 31),
 (23, 'bp_ultimate_diesel','BP Ultimate Diesel', 'bp',        'diesel', null, false, false, 32),
 (31, 'vivo_revvo90',      'Revvo 90',           'vivo',      'bensin', 90, false, false, 40),
 (32, 'vivo_revvo92',      'Revvo 92',           'vivo',      'bensin', 92, false, false, 41),
 (33, 'vivo_revvo95',      'Revvo 95',           'vivo',      'bensin', 95, false, false, 42);

insert into app_settings (key, value, description) values
 ('status_window_min',    '120',   'Jendela laporan yang dihitung (menit)'),
 ('decay_tau_min',        '60',    'Konstanta peluruhan (menit)'),
 ('min_weight',           '0.2',   'Ambang total bobot sebelum status menjadi unknown'),
 ('confirm_window_min',   '30',    'Jendela untuk tanda dikonfirmasi warga'),
 ('geofence_m',           '300',   'Jarak maksimal pelapor ke SPBU (meter)'),
 ('max_accuracy_m',       '100',   'Akurasi GPS terburuk yang diterima (meter)'),
 ('station_cooldown_min', '30',    'Jeda lapor per SPBU per perangkat (menit)'),
 ('hourly_report_limit',  '6',     'Maksimal laporan per perangkat per jam'),
 ('ip_hourly_limit',      '40',    'Maksimal laporan per hash IP per jam sebelum karantina'),
 ('queue_window_min',     '60',    'Jendela tingkat antrean dan waktu tunggu (menit)'),
 ('dispute_flag_count',   '3',     'Jumlah bantahan tanpa konfirmasi sebelum masuk antrean moderasi'),
 ('read_only',            'false', 'Mode baca-saja darurat');

insert into site_metrics_live (id, online_now, visitors_total, launched_at) values (1, 0, 0, now());

-- Garam hash IP harian (ARCHITECTURE.md 4.4), dirotasi oleh job rotate-ip-salt
create table private.ip_salt (
  id smallint primary key default 1 check (id = 1),
  salt text not null,
  rotated_at timestamptz not null default now()
);
insert into private.ip_salt (salt) values (encode(extensions.gen_random_bytes(32), 'hex'));


-- ===== 0004_functions.sql =====
-- Fungsi inti (ARCHITECTURE.md bagian 4). Logika status HANYA ada di sini.
set search_path = public, extensions;

-- Peta wilayah dengan SPBU tanpa baris status dihitung sebagai unknown
create or replace view region_status_now as
select s.region_id,
       sf.fuel_type_id,
       count(*) filter (where sfs.status = 'available') as available,
       count(*) filter (where sfs.status = 'limited')   as limited,
       count(*) filter (where sfs.status = 'empty')     as empty,
       count(*) filter (where coalesce(sfs.status, 'unknown') = 'unknown') as unknown
from stations s
join station_fuels sf on sf.station_id = s.id
left join station_fuel_status sfs on sfs.station_id = sf.station_id and sfs.fuel_type_id = sf.fuel_type_id
where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
group by s.region_id, sf.fuel_type_id;

-- ───────────────────────── Pembantu ─────────────────────────

create or replace function setting_num(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select (value #>> '{}')::numeric from app_settings where key = p_key
$$;

create or replace function setting_bool(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from app_settings where key = p_key), false)
$$;

create or replace function private.request_ip_hash() returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_h    jsonb;
  v_ip   text;
  v_salt text;
begin
  begin
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_h := null;
  end;
  v_ip := trim(split_part(coalesce(v_h->>'cf-connecting-ip', v_h->>'x-forwarded-for', v_h->>'x-real-ip', ''), ',', 1));
  if v_ip = '' then
    return null;
  end if;
  select salt into v_salt from private.ip_salt where id = 1;
  return encode(extensions.digest(v_salt || v_ip, 'sha256'), 'hex');
end;
$$;

create or replace function private.rotate_ip_salt() returns void
language sql security definer set search_path = public, extensions as $$
  update private.ip_salt set salt = encode(extensions.gen_random_bytes(32), 'hex'), rotated_at = now() where id = 1;
$$;

-- Nama samaran bernuansa Bali dari hash ID, misalnya "Jepun 21"
create or replace function private.make_pseudonym(p_id uuid) returns text
language sql immutable as $$
  select (array['Jepun','Cempaka','Kamboja','Sandat','Gumitir','Tunjung','Kenanga','Majegau',
                'Cendana','Pandan','Padma','Melati','Kenari','Belimbing','Ylang','Sekar'])
           [1 + ((('x' || substr(md5(p_id::text), 1, 8))::bit(32)::int) & 15)]
         || ' '
         || lpad((((('x' || substr(md5(p_id::text), 9, 8))::bit(32)::int) & 2147483647) % 100)::text, 2, '0')
$$;

create or replace function ensure_profile(p_uid uuid) returns profiles
language plpgsql security definer set search_path = public as $$
declare
  v profiles;
begin
  select * into v from profiles where id = p_uid;
  if found then
    return v;
  end if;
  insert into profiles (id, pseudonym, signup_ip_hash)
  values (p_uid, private.make_pseudonym(p_uid), private.request_ip_hash())
  on conflict (id) do nothing;
  select * into v from profiles where id = p_uid;
  return v;
end;
$$;

create or replace function log_abuse(p_uid uuid, p_ip text, p_kind abuse_kind, p_station uuid, p_detail jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into abuse_events (profile_id, ip_hash, kind, station_id, detail)
  values (p_uid, p_ip, p_kind, p_station, p_detail);
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not is_blocked)
$$;

-- Satu baris /api/status: [id, overall, confirmed, queue, wait_low, wait_high, last_report_at, [[fuel, status, confirmed, last_at]]]
create or replace function station_status_payload(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_array(
           s.id,
           coalesce(ss.overall_status, 'unknown'),
           coalesce(ss.is_confirmed, false),
           ss.queue_level,
           ss.wait_min_low,
           ss.wait_min_high,
           ss.last_report_at,
           coalesce((
             select jsonb_agg(jsonb_build_array(f.fuel_type_id, f.status, f.is_confirmed, f.last_report_at)
                              order by f.fuel_type_id)
               from station_fuel_status f
              where f.station_id = s.id and f.status <> 'unknown'
           ), '[]'::jsonb))
    from stations s
    left join station_status ss on ss.station_id = s.id
   where s.id = p_id
$$;

-- ───────────────────────── Perhitungan status (ARCHITECTURE.md 4.5) ─────────────────────────

create or replace function recompute_station_status(p_station uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_window  interval := make_interval(mins => setting_num('status_window_min')::int);
  v_tau_s   numeric  := setting_num('decay_tau_min') * 60;
  v_min_w   numeric  := setting_num('min_weight');
  v_confirm interval := make_interval(mins => setting_num('confirm_window_min')::int);
  v_qwin    interval := make_interval(mins => setting_num('queue_window_min')::int);
  v_old     jsonb    := station_status_payload(p_station);
  v_new     jsonb;
begin
  -- 1. Status per jenis BBM
  with recent as (
    select ri.fuel_type_id, ri.availability, r.created_at, r.reporter_id, p.trust_score,
           coalesce(v.confirms, 0) as confirms, coalesce(v.disputes, 0) as disputes
      from reports r
      join report_items ri on ri.report_id = r.id
      join profiles p on p.id = r.reporter_id
      left join lateral (
        select count(*) filter (where vote = 'confirm') as confirms,
               count(*) filter (where vote = 'dispute') as disputes
          from report_votes where report_id = r.id
      ) v on true
     where r.station_id = p_station
       and r.moderation_status = 'active'
       and r.created_at > now() - v_window
  ),
  weighted as (
    select fuel_type_id, availability,
           sum(trust_score
               * exp(-extract(epoch from now() - created_at) / v_tau_s)
               * greatest(0, least(2, 1 + 0.3 * confirms - 0.5 * disputes))) as w,
           max(created_at) as last_at,
           count(*) as n,
           count(distinct reporter_id) filter (where created_at > now() - v_confirm) as recent_reporters
      from recent
     group by fuel_type_id, availability
  ),
  ranked as (
    select *,
           sum(w)       over (partition by fuel_type_id) as total_w,
           max(last_at) over (partition by fuel_type_id) as fuel_last_at,
           sum(n)       over (partition by fuel_type_id) as fuel_n,
           row_number() over (partition by fuel_type_id order by w desc, last_at desc) as rn
      from weighted
  )
  insert into station_fuel_status as t
         (station_id, fuel_type_id, status, confidence, is_confirmed,
          last_report_at, report_count, updated_at)
  select p_station, sf.fuel_type_id,
         case when r.total_w is null or r.total_w < v_min_w then 'unknown'
              else r.availability::text end::fuel_status,
         coalesce(round(r.w / nullif(r.total_w, 0), 2), 0),
         coalesce(r.total_w >= v_min_w and r.recent_reporters >= 2, false),
         r.fuel_last_at,
         coalesce(r.fuel_n, 0),
         now()
    from station_fuels sf
    left join ranked r on r.fuel_type_id = sf.fuel_type_id and r.rn = 1
   where sf.station_id = p_station
  on conflict (station_id, fuel_type_id) do update
     set status = excluded.status, confidence = excluded.confidence,
         is_confirmed = excluded.is_confirmed, last_report_at = excluded.last_report_at,
         report_count = excluded.report_count, updated_at = excluded.updated_at;

  -- 2. Status keseluruhan, antrean, perkiraan waktu tunggu
  insert into station_status as t
         (station_id, overall_status, is_confirmed, queue_level,
          wait_min_low, wait_min_high, last_report_at, updated_at)
  select p_station,
         case when bool_or(f.status = 'available') then 'available'
              when bool_or(f.status = 'limited')   then 'limited'
              when bool_or(f.status = 'empty')     then 'empty'
              else 'unknown' end::fuel_status,
         coalesce(bool_or(f.is_confirmed and f.status <> 'unknown'), false),
         (select r.queue_level from reports r
           where r.station_id = p_station and r.moderation_status = 'active'
             and r.queue_level is not null and r.created_at > now() - v_qwin
           order by r.created_at desc limit 1),
         w.p25, w.p75,
         max(f.last_report_at) filter (where f.status <> 'unknown'),
         now()
    from station_fuel_status f
    cross join lateral (
      select case when count(*) >= 3
                  then (percentile_cont(0.25) within group (order by m))::smallint end as p25,
             case when count(*) >= 3
                  then (percentile_cont(0.75) within group (order by m))::smallint end as p75
        from (
          select wait_minutes as m from reports
           where station_id = p_station and moderation_status = 'active'
             and wait_minutes is not null and created_at > now() - v_qwin
          union all
          select wait_minutes from queue_sessions
           where station_id = p_station and end_reason = 'got_fuel'
             and ended_at > now() - v_qwin and wait_minutes is not null
        ) x
    ) w
   where f.station_id = p_station
   group by w.p25, w.p75
  on conflict (station_id) do update
     set overall_status = excluded.overall_status, is_confirmed = excluded.is_confirmed,
         queue_level = excluded.queue_level, wait_min_low = excluded.wait_min_low,
         wait_min_high = excluded.wait_min_high, last_report_at = excluded.last_report_at,
         updated_at = excluded.updated_at;

  -- 3. Siarkan hanya jika ada perubahan. Kegagalan realtime tidak boleh membatalkan laporan.
  v_new := station_status_payload(p_station);
  if v_new is distinct from v_old then
    begin
      perform realtime.send(v_new, 'status', 'status:bali', false);
    exception when others then
      null;
    end;
  end if;
end;
$$;

-- ───────────────────────── Tulis: laporan (ARCHITECTURE.md 4.4) ─────────────────────────

create or replace function submit_report(
  p_station_id   uuid,
  p_lat          double precision,
  p_lng          double precision,
  p_accuracy_m   real,
  p_items        jsonb,              -- [{"fuel_type_id":1,"availability":"available"}]
  p_queue_level  queue_level default null,
  p_wait_minutes smallint    default null,
  p_note         text        default null
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_ip_hash  text := private.request_ip_hash();
  v_profile  profiles;
  v_station  stations;
  v_point    geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_dist     real;
  v_n_valid  int;
  v_status   moderation_status := 'active';
  v_reason   text;
  v_prev     record;
  v_id       uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;
  if setting_bool('read_only') then
    return jsonb_build_object('ok', false, 'code', 'READ_ONLY');
  end if;

  v_profile := ensure_profile(v_uid);
  if v_profile.is_blocked then
    perform log_abuse(v_uid, v_ip_hash, 'blocked_profile', p_station_id, null);
    return jsonb_build_object('ok', false, 'code', 'BLOCKED');
  end if;

  select * into v_station from stations
   where id = p_station_id and is_active
     and moderation_status = 'approved' and kind <> 'terminal';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STATION_NOT_FOUND');
  end if;

  if p_accuracy_m is null or p_accuracy_m > setting_num('max_accuracy_m') then
    perform log_abuse(v_uid, v_ip_hash, 'low_accuracy', p_station_id,
                      jsonb_build_object('accuracy_m', p_accuracy_m));
    return jsonb_build_object('ok', false, 'code', 'LOW_ACCURACY');
  end if;

  v_dist := st_distance(v_station.location, v_point);
  if v_dist > setting_num('geofence_m') then
    perform log_abuse(v_uid, v_ip_hash, 'out_of_range', p_station_id,
                      jsonb_build_object('distance_m', round(v_dist)));
    return jsonb_build_object('ok', false, 'code', 'OUT_OF_RANGE',
                              'distance_m', round(v_dist));
  end if;

  if exists (
    select 1 from reports
     where reporter_id = v_uid and station_id = p_station_id
       and created_at > now() - make_interval(mins => setting_num('station_cooldown_min')::int)
  ) then
    perform log_abuse(v_uid, v_ip_hash, 'rate_limit_station', p_station_id, null);
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMIT_STATION');
  end if;

  if (select count(*) from reports
       where reporter_id = v_uid and created_at > now() - interval '1 hour')
     >= setting_num('hourly_report_limit') then
    perform log_abuse(v_uid, v_ip_hash, 'rate_limit_hourly', p_station_id, null);
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMIT_HOURLY');
  end if;

  -- Setiap item harus jenis BBM yang dijual SPBU ini, tanpa duplikat
  if jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS');
  end if;
  select count(distinct i.fuel_type_id) into v_n_valid
    from jsonb_to_recordset(p_items) as i(fuel_type_id smallint, availability fuel_availability)
    join station_fuels sf
      on sf.station_id = p_station_id and sf.fuel_type_id = i.fuel_type_id;
  if v_n_valid = 0 or v_n_valid <> jsonb_array_length(p_items) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS');
  end if;

  -- Karantina senyap: lonjakan dari satu IP
  if v_ip_hash is not null and (select count(*) from reports
       where ip_hash = v_ip_hash and created_at > now() - interval '1 hour')
     >= setting_num('ip_hourly_limit') then
    v_status := 'quarantined';
    v_reason := 'ip_burst';
  end if;

  -- Karantina senyap: perjalanan mustahil (lebih cepat dari 120 km/jam)
  select r.created_at, st_distance(s.location, v_station.location) as d
    into v_prev
    from reports r join stations s on s.id = r.station_id
   where r.reporter_id = v_uid
   order by r.created_at desc limit 1;
  if found and v_prev.d / greatest(extract(epoch from now() - v_prev.created_at), 1) > 33.3 then
    v_status := 'quarantined';
    v_reason := coalesce(v_reason || ',', '') || 'impossible_travel';
  end if;

  if v_status = 'quarantined' then
    perform log_abuse(v_uid, v_ip_hash, 'burst_quarantine', p_station_id,
                      jsonb_build_object('reason', v_reason));
  end if;

  insert into reports (station_id, reporter_id, queue_level, wait_minutes, note,
                       reporter_location, distance_m, accuracy_m,
                       moderation_status, quarantine_reason, ip_hash)
  values (p_station_id, v_uid, p_queue_level,
          case when p_wait_minutes between 0 and 600 then p_wait_minutes end,
          left(nullif(trim(p_note), ''), 140),
          st_setsrid(st_makepoint(round(p_lng::numeric, 4), round(p_lat::numeric, 4)), 4326)::geography,
          v_dist, p_accuracy_m, v_status, v_reason, v_ip_hash)
  returning id into v_id;

  insert into report_items (report_id, fuel_type_id, availability)
  select v_id, i.fuel_type_id, i.availability
    from jsonb_to_recordset(p_items) as i(fuel_type_id smallint, availability fuel_availability);

  update profiles
     set report_count = report_count + 1, last_active_at = now()
   where id = v_uid;

  if v_status = 'active' then
    perform recompute_station_status(p_station_id);
  end if;

  -- Respons sama untuk laporan aktif maupun dikarantina, agar penyerang tidak tahu
  return jsonb_build_object('ok', true, 'report_id', v_id);
end;
$$;

-- ───────────────────────── Tulis: validasi warga ─────────────────────────

create or replace function cast_vote(
  p_report_id  uuid,
  p_vote       vote_type,
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy_m real
) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  v_uid      uuid := auth.uid();
  v_ip_hash  text := private.request_ip_hash();
  v_profile  profiles;
  v_report   reports;
  v_station  stations;
  v_point    geography := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
  v_dist     real;
  v_confirms int;
  v_disputes int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED');
  end if;
  if setting_bool('read_only') then
    return jsonb_build_object('ok', false, 'code', 'READ_ONLY');
  end if;

  v_profile := ensure_profile(v_uid);
  if v_profile.is_blocked then
    perform log_abuse(v_uid, v_ip_hash, 'blocked_profile', null, null);
    return jsonb_build_object('ok', false, 'code', 'BLOCKED');
  end if;

  select * into v_report from reports
   where id = p_report_id and moderation_status = 'active'
     and created_at > now() - interval '24 hours';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'REPORT_NOT_FOUND');
  end if;
  if v_report.reporter_id = v_uid then
    return jsonb_build_object('ok', false, 'code', 'OWN_REPORT');
  end if;

  select * into v_station from stations where id = v_report.station_id;

  if p_accuracy_m is null or p_accuracy_m > setting_num('max_accuracy_m') then
    perform log_abuse(v_uid, v_ip_hash, 'low_accuracy', v_station.id,
                      jsonb_build_object('accuracy_m', p_accuracy_m, 'vote', true));
    return jsonb_build_object('ok', false, 'code', 'LOW_ACCURACY');
  end if;

  v_dist := st_distance(v_station.location, v_point);
  if v_dist > setting_num('geofence_m') then
    perform log_abuse(v_uid, v_ip_hash, 'out_of_range', v_station.id,
                      jsonb_build_object('distance_m', round(v_dist), 'vote', true));
    return jsonb_build_object('ok', false, 'code', 'OUT_OF_RANGE', 'distance_m', round(v_dist));
  end if;

  insert into report_votes (report_id, voter_id, vote, distance_m)
  values (p_report_id, v_uid, p_vote, v_dist)
  on conflict do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_VOTED');
  end if;

  update profiles
     set confirmed_count = confirmed_count + (p_vote = 'confirm')::int,
         disputed_count  = disputed_count  + (p_vote = 'dispute')::int
   where id = v_report.reporter_id;
  update profiles set last_active_at = now() where id = v_uid;

  perform recompute_station_status(v_report.station_id);

  select count(*) filter (where vote = 'confirm'), count(*) filter (where vote = 'dispute')
    into v_confirms, v_disputes
    from report_votes where report_id = p_report_id;

  return jsonb_build_object('ok', true, 'confirms', v_confirms, 'disputes', v_disputes);
end;
$$;

-- ───────────────────────── Baca publik ─────────────────────────

create or replace function station_recent_reports(p_station_id uuid, p_limit int default 5)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select r.id, r.created_at, r.queue_level as queue, r.wait_minutes, r.note,
             coalesce((select jsonb_agg(jsonb_build_object('fuel_type_id', ri.fuel_type_id,
                                                           'availability', ri.availability)
                                        order by ri.fuel_type_id)
                         from report_items ri where ri.report_id = r.id), '[]'::jsonb) as items,
             (select count(*) from report_votes v where v.report_id = r.id and v.vote = 'confirm') as confirms,
             (select count(*) from report_votes v where v.report_id = r.id and v.vote = 'dispute') as disputes,
             coalesce(r.reporter_id = auth.uid(), false) as is_mine,
             (select v.vote from report_votes v where v.report_id = r.id and v.voter_id = auth.uid()) as my_vote
        from reports r
       where r.station_id = p_station_id
         and r.created_at > now() - interval '24 hours'
         -- pelapor tetap melihat laporannya sendiri yang dikarantina senyap
         and (r.moderation_status = 'active'
              or (r.moderation_status = 'quarantined' and r.reporter_id = auth.uid()))
       order by r.created_at desc
       limit least(greatest(coalesce(p_limit, 5), 1), 20)
    ) x
$$;

create or replace function public_places_snapshot() returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'v', 1,
    'generated_at', now(),
    'fuel_types', (select jsonb_agg(jsonb_build_array(id, code, name, brand, is_filter_tab) order by sort_order)
                     from fuel_types),
    'places', (select coalesce(jsonb_agg(jsonb_build_array(
                        s.id, s.slug, s.kind, s.brand, s.spbu_code, s.name,
                        round(st_y(s.location::geometry)::numeric, 6),
                        round(st_x(s.location::geometry)::numeric, 6),
                        s.region_id, s.is_24h,
                        coalesce((select jsonb_agg(sf.fuel_type_id order by sf.fuel_type_id)
                                    from station_fuels sf where sf.station_id = s.id), '[]'::jsonb),
                        s.address) order by s.name), '[]'::jsonb)
                 from stations s
                where s.is_active and s.moderation_status = 'approved')
  )
$$;

create or replace function public_status_snapshot() returns jsonb
language sql stable security definer
set search_path = public
as $$
  with spbu as (
    select s.id from stations s
     where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
  ),
  per_fuel as (
    select sf.fuel_type_id::text as k,
           jsonb_build_array(
             count(*) filter (where sfs.status = 'available'),
             count(*) filter (where sfs.status = 'limited'),
             count(*) filter (where sfs.status = 'empty'),
             count(*) filter (where coalesce(sfs.status, 'unknown') = 'unknown')) as c
      from station_fuels sf
      join spbu on spbu.id = sf.station_id
      left join station_fuel_status sfs
        on sfs.station_id = sf.station_id and sfs.fuel_type_id = sf.fuel_type_id
     group by sf.fuel_type_id
  ),
  overall as (
    select jsonb_build_array(
             count(*) filter (where ss.overall_status = 'available'),
             count(*) filter (where ss.overall_status = 'limited'),
             count(*) filter (where ss.overall_status = 'empty'),
             count(*) filter (where coalesce(ss.overall_status, 'unknown') = 'unknown')) as c
      from spbu left join station_status ss on ss.station_id = spbu.id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'online_now', coalesce((select online_now from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'read_only', setting_bool('read_only'),
    'summary', coalesce((select jsonb_object_agg(k, c) from per_fuel), '{}'::jsonb)
               || jsonb_build_object('all', (select c from overall)),
    'stations', coalesce((
        select jsonb_agg(station_status_payload(ss.station_id))
          from station_status ss
          join stations s on s.id = ss.station_id
         where s.is_active and s.moderation_status = 'approved'
           and (ss.overall_status <> 'unknown' or ss.queue_level is not null)
      ), '[]'::jsonb),
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                            'level', a.level, 'region_id', a.region_id,
                                            'ends_at', a.ends_at)
                         order by a.level desc, a.starts_at desc)
          from announcements a
         where now() between a.starts_at and a.ends_at
      ), '[]'::jsonb)
  )
$$;

-- Data halaman /data, hanya dari tabel agregat (ARCHITECTURE.md 3.3)
create or replace function public_dashboard() returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'launched_at', (select launched_at from site_metrics_live where id = 1),
    'visitors_total', (select visitors_total from site_metrics_live where id = 1),
    'online_now', (select online_now from site_metrics_live where id = 1),
    'reports_accepted', (select coalesce(sum(reports_accepted), 0) from report_stats_hourly),
    'reporters_unique', (select count(*) from profiles where report_count > 0),
    'stations_fresh', (select count(*) from station_status ss join stations s on s.id = ss.station_id
                        where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
                          and ss.overall_status <> 'unknown'),
    'stations_total', (select count(*) from stations
                        where kind = 'spbu' and is_active and moderation_status = 'approved'),
    'hourly', coalesce((
        select jsonb_agg(jsonb_build_array(hour, items_available, items_limited, items_empty,
                                           reports_accepted, wait_median_min) order by hour)
          from report_stats_hourly where hour > now() - interval '48 hours'
      ), '[]'::jsonb),
    'regions', coalesce((
        select jsonb_agg(jsonb_build_array(region_id, fuel_type_id, available, limited, empty, unknown))
          from region_status_now
      ), '[]'::jsonb),
    'uptime', coalesce((
        select jsonb_agg(jsonb_build_array(h, ok, total) order by h)
          from (select date_trunc('hour', checked_at) as h,
                       count(*) filter (where ok) as ok, count(*) as total
                  from uptime_checks where target = 'site'
                 group by 1) u
      ), '[]'::jsonb),
    'incidents', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'started_at', started_at,
                                            'ended_at', ended_at, 'title', title, 'body', body)
                         order by started_at desc)
          from incidents where is_public
      ), '[]'::jsonb),
    'rejections_24h', (
        select jsonb_build_object(
                 'out_of_range', coalesce(sum(rejected_out_of_range), 0),
                 'rate_limit', coalesce(sum(rejected_rate_limit), 0),
                 'other', coalesce(sum(rejected_other), 0),
                 'quarantined_reports', coalesce(sum(quarantined_reports), 0),
                 'quarantined_places', coalesce(sum(quarantined_places), 0))
          from report_stats_hourly where hour > now() - interval '24 hours')
  )
$$;

-- ───────────────────────── Job terjadwal ─────────────────────────

create or replace function decay_all_statuses() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  for v_id in
    select station_id from reports where created_at > now() - interval '3 hours'
    union
    select station_id from station_status where overall_status <> 'unknown' or queue_level is not null
  loop
    perform recompute_station_status(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function refresh_report_stats() returns void
language sql security definer set search_path = public as $$
  insert into report_stats_hourly as t
    (hour, reports_accepted, reporters_unique, items_available, items_limited, items_empty,
     rejected_out_of_range, rejected_rate_limit, rejected_other,
     quarantined_reports, quarantined_places, wait_median_min)
  select h.hour,
         (select count(*) from reports r
           where r.created_at >= h.hour and r.created_at < h.hour + interval '1 hour'
             and r.moderation_status in ('active', 'hidden')),
         (select count(distinct r.reporter_id) from reports r
           where r.created_at >= h.hour and r.created_at < h.hour + interval '1 hour'
             and r.moderation_status in ('active', 'hidden')),
         i.a, i.l, i.e,
         coalesce(ab.oor, 0), coalesce(ab.rl, 0), coalesce(ab.other, 0),
         (select count(*) from reports r
           where r.created_at >= h.hour and r.created_at < h.hour + interval '1 hour'
             and r.moderation_status = 'quarantined'),
         (select count(*) from stations s
           where s.created_at >= h.hour and s.created_at < h.hour + interval '1 hour'
             and s.source = 'user' and s.moderation_status = 'quarantined'),
         (select (percentile_cont(0.5) within group (order by r.wait_minutes))::smallint from reports r
           where r.created_at >= h.hour and r.created_at < h.hour + interval '1 hour'
             and r.moderation_status = 'active' and r.wait_minutes is not null)
    from (select date_trunc('hour', now()) as hour
          union all
          select date_trunc('hour', now()) - interval '1 hour') h
    cross join lateral (
      select count(*) filter (where ri.availability = 'available') as a,
             count(*) filter (where ri.availability = 'limited')   as l,
             count(*) filter (where ri.availability = 'empty')     as e
        from reports r join report_items ri on ri.report_id = r.id
       where r.created_at >= h.hour and r.created_at < h.hour + interval '1 hour'
         and r.moderation_status = 'active'
    ) i
    left join lateral (
      select count(*) filter (where kind = 'out_of_range') as oor,
             count(*) filter (where kind in ('rate_limit_station', 'rate_limit_hourly')) as rl,
             count(*) filter (where kind in ('low_accuracy', 'blocked_profile', 'place_rejected')) as other
        from abuse_events
       where created_at >= h.hour and created_at < h.hour + interval '1 hour'
    ) ab on true
  on conflict (hour) do update
     set reports_accepted = excluded.reports_accepted, reporters_unique = excluded.reporters_unique,
         items_available = excluded.items_available, items_limited = excluded.items_limited,
         items_empty = excluded.items_empty, rejected_out_of_range = excluded.rejected_out_of_range,
         rejected_rate_limit = excluded.rejected_rate_limit, rejected_other = excluded.rejected_other,
         quarantined_reports = excluded.quarantined_reports,
         quarantined_places = excluded.quarantined_places, wait_median_min = excluded.wait_median_min;
$$;

create or replace function run_retention() returns void
language sql security definer set search_path = public as $$
  update reports set reporter_location = null
   where reporter_location is not null and created_at < now() - interval '30 days';
  delete from queue_pings where at < now() - interval '24 hours';
  delete from queue_messages where created_at < now() - interval '7 days';
  delete from abuse_events where created_at < now() - interval '90 days';
$$;

-- ───────────────────────── Admin (semua menulis admin_audit_log) ─────────────────────────

create or replace function private.audit(p_action text, p_table text, p_id text, p_detail jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into admin_audit_log (admin_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_table, p_id, p_detail);
$$;

create or replace function admin_moderation_queue(p_filter text default 'flagged', p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_flag int := setting_num('dispute_flag_count')::int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select r.id, r.created_at, r.station_id, s.name as station_name, r.moderation_status,
               r.quarantine_reason, r.queue_level, r.wait_minutes, r.note, round(r.distance_m) as distance_m,
               r.accuracy_m, r.reporter_id, p.pseudonym, p.is_blocked, p.report_count, p.disputed_count,
               (select jsonb_agg(jsonb_build_array(ri.fuel_type_id, ri.availability)) from report_items ri
                 where ri.report_id = r.id) as items,
               v.confirms, v.disputes
          from reports r
          join stations s on s.id = r.station_id
          join profiles p on p.id = r.reporter_id
          cross join lateral (
            select count(*) filter (where vote = 'confirm') as confirms,
                   count(*) filter (where vote = 'dispute') as disputes
              from report_votes where report_id = r.id
          ) v
         where case p_filter
                 when 'flagged'     then r.moderation_status = 'active' and v.disputes >= v_flag and v.confirms = 0
                 when 'quarantined' then r.moderation_status = 'quarantined'
                 when 'hidden'      then r.moderation_status = 'hidden'
                 else r.created_at > now() - interval '24 hours'
               end
         order by r.created_at desc
         limit least(coalesce(p_limit, 100), 500)
      ) x), '[]'::jsonb));
end;
$$;

create or replace function admin_set_report_status(p_ids uuid[], p_status moderation_status, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_station uuid;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_status not in ('active', 'hidden', 'quarantined') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS');
  end if;
  update reports set moderation_status = p_status where id = any(p_ids);
  for v_station in select distinct station_id from reports where id = any(p_ids) loop
    perform recompute_station_status(v_station);
  end loop;
  perform private.audit('report_' || p_status, 'reports', array_to_string(p_ids, ','),
                        jsonb_build_object('note', p_note, 'count', cardinality(p_ids)));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function admin_block_profile(p_profile uuid, p_block boolean, p_reason text default null,
                                               p_hide_recent boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_station uuid;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  update profiles set is_blocked = p_block, blocked_reason = case when p_block then p_reason end
   where id = p_profile and role <> 'admin';
  if p_block and p_hide_recent then
    for v_station in
      update reports set moderation_status = 'hidden'
       where reporter_id = p_profile and moderation_status = 'active'
         and created_at > now() - interval '24 hours'
      returning station_id
    loop
      perform recompute_station_status(v_station);
    end loop;
  end if;
  perform private.audit(case when p_block then 'block_profile' else 'unblock_profile' end,
                        'profiles', p_profile::text, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function admin_update_station(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  update stations set
    name              = coalesce(p_patch->>'name', name),
    address           = case when p_patch ? 'address' then p_patch->>'address' else address end,
    spbu_code         = case when p_patch ? 'spbu_code' then nullif(p_patch->>'spbu_code', '') else spbu_code end,
    brand             = coalesce((p_patch->>'brand')::brand_type, brand),
    kind              = coalesce((p_patch->>'kind')::place_kind, kind),
    region_id         = coalesce((p_patch->>'region_id')::smallint, region_id),
    is_24h            = coalesce((p_patch->>'is_24h')::boolean, is_24h),
    is_active         = coalesce((p_patch->>'is_active')::boolean, is_active),
    moderation_status = coalesce((p_patch->>'moderation_status')::moderation_status, moderation_status),
    location          = case when p_patch ? 'lat' and p_patch ? 'lng'
                             then st_setsrid(st_makepoint((p_patch->>'lng')::float8, (p_patch->>'lat')::float8), 4326)::geography
                             else location end,
    updated_at        = now()
  where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STATION_NOT_FOUND');
  end if;
  if p_patch ? 'fuel_ids' then
    delete from station_fuels where station_id = p_id;
    insert into station_fuels (station_id, fuel_type_id)
    select p_id, x::smallint from jsonb_array_elements_text(p_patch->'fuel_ids') x;
    delete from station_fuel_status
     where station_id = p_id
       and fuel_type_id not in (select fuel_type_id from station_fuels where station_id = p_id);
    perform recompute_station_status(p_id);
  end if;
  perform private.audit('update_station', 'stations', p_id::text, p_patch);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function admin_upsert_announcement(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if v_id is null then
    insert into announcements (title, body, level, region_id, starts_at, ends_at, created_by)
    values (p->>'title', p->>'body', coalesce((p->>'level')::announcement_level, 'info'),
            nullif(p->>'region_id', '')::smallint,
            coalesce((p->>'starts_at')::timestamptz, now()), (p->>'ends_at')::timestamptz, auth.uid())
    returning id into v_id;
  else
    update announcements set
      title = p->>'title', body = p->>'body',
      level = coalesce((p->>'level')::announcement_level, level),
      region_id = nullif(p->>'region_id', '')::smallint,
      starts_at = coalesce((p->>'starts_at')::timestamptz, starts_at),
      ends_at = coalesce((p->>'ends_at')::timestamptz, ends_at)
    where id = v_id;
  end if;
  perform private.audit('upsert_announcement', 'announcements', v_id::text, p);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function admin_upsert_incident(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if v_id is null then
    insert into incidents (kind, started_at, ended_at, title, body, is_public, created_by)
    values ((p->>'kind')::incident_kind, (p->>'started_at')::timestamptz,
            nullif(p->>'ended_at', '')::timestamptz, p->>'title', p->>'body',
            coalesce((p->>'is_public')::boolean, true), auth.uid())
    returning id into v_id;
  else
    update incidents set
      kind = (p->>'kind')::incident_kind, started_at = (p->>'started_at')::timestamptz,
      ended_at = nullif(p->>'ended_at', '')::timestamptz, title = p->>'title', body = p->>'body',
      is_public = coalesce((p->>'is_public')::boolean, is_public)
    where id = v_id;
  end if;
  perform private.audit('upsert_incident', 'incidents', v_id::text, p);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function admin_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  update app_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'UNKNOWN_SETTING');
  end if;
  perform private.audit('set_setting', 'app_settings', p_key, jsonb_build_object('value', p_value));
  return jsonb_build_object('ok', true);
end;
$$;

-- ───────────────────────── Hak akses fungsi ─────────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function station_recent_reports(uuid, int) to anon, authenticated;
grant execute on function public_places_snapshot() to anon, authenticated;
grant execute on function public_status_snapshot() to anon, authenticated;
grant execute on function public_dashboard() to anon, authenticated;
grant execute on function is_admin() to authenticated;

grant execute on function submit_report(uuid, double precision, double precision, real, jsonb, queue_level, smallint, text) to authenticated;
grant execute on function cast_vote(uuid, vote_type, double precision, double precision, real) to authenticated;

grant execute on function admin_moderation_queue(text, int) to authenticated;
grant execute on function admin_set_report_status(uuid[], moderation_status, text) to authenticated;
grant execute on function admin_block_profile(uuid, boolean, text, boolean) to authenticated;
grant execute on function admin_update_station(uuid, jsonb) to authenticated;
grant execute on function admin_upsert_announcement(jsonb) to authenticated;
grant execute on function admin_upsert_incident(jsonb) to authenticated;
grant execute on function admin_set_setting(text, jsonb) to authenticated;

-- Fungsi yang dipakai oleh kebijakan RLS
grant execute on function is_admin() to anon;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;


-- ===== 0005_rls.sql =====
-- Row Level Security (ERD.md bagian 7).
-- Prinsip: publik hanya membaca data aman, semua tulis lewat fungsi security definer.

do $$
declare
  t text;
begin
  foreach t in array array[
    'regions','profiles','stations','fuel_types','station_fuels','reports','report_items','report_votes',
    'station_fuel_status','station_status','announcements','station_corrections','station_operators',
    'abuse_events','admin_audit_log','app_settings','queue_sessions','queue_pings','queue_messages',
    'report_stats_hourly','site_metrics_hourly','site_metrics_live','uptime_checks','incidents'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke insert, update, delete, truncate on table %I from anon, authenticated', t);
    -- admin: baca penuh. Tulis admin tetap lewat fungsi admin_* agar tercatat di log audit.
    execute format('create policy admin_read on %I for select to authenticated using (is_admin())', t);
  end loop;
end $$;

-- Referensi publik
create policy public_read on regions for select to anon, authenticated using (true);
create policy public_read on fuel_types for select to anon, authenticated using (true);
create policy public_read on station_fuels for select to anon, authenticated using (true);

create policy public_read on stations for select to anon, authenticated
  using ((is_active and moderation_status = 'approved')
         or (created_by = auth.uid() and moderation_status in ('pending', 'quarantined')));

create policy public_read on station_status for select to anon, authenticated using (true);
create policy public_read on station_fuel_status for select to anon, authenticated using (true);

create policy public_read on announcements for select to anon, authenticated
  using (now() between starts_at and ends_at);

create policy public_read on report_stats_hourly for select to anon, authenticated using (true);
create policy public_read on site_metrics_hourly for select to anon, authenticated using (true);
create policy public_read on site_metrics_live for select to anon, authenticated using (true);
create policy public_read on uptime_checks for select to anon, authenticated using (true);
create policy public_read on incidents for select to anon, authenticated using (is_public);

-- Milik sendiri
create policy own_read on profiles for select to authenticated using (id = auth.uid());
create policy own_read on queue_sessions for select to authenticated using (profile_id = auth.uid());
create policy own_read on queue_pings for select to authenticated
  using (exists (select 1 from queue_sessions s where s.id = session_id and s.profile_id = auth.uid()));

-- reports, report_items, report_votes, abuse_events, admin_audit_log, app_settings:
-- tidak ada kebijakan publik. Publik membaca laporan lewat station_recent_reports().

-- Kabar antrean (P1) tanpa profile_id
create view queue_messages_public with (security_invoker = false) as
select m.id, m.station_id, p.pseudonym, m.body, m.created_at
  from queue_messages m
  join profiles p on p.id = m.profile_id
 where m.moderation_status = 'active' and m.expires_at > now();
grant select on queue_messages_public to anon, authenticated;

-- View region_status_now hanya untuk public_dashboard()
revoke all on region_status_now from anon, authenticated;


-- ===== 0006_cron.sql =====
-- Job terjadwal (ARCHITECTURE.md 4.6). Waktu cron dalam UTC: 03.00 WITA = 19.00 UTC, 00.00 WITA = 16.00 UTC.

select cron.schedule('decay-status',   '*/5 * * * *', $$select public.decay_all_statuses()$$);
select cron.schedule('stats-hourly',   '*/5 * * * *', $$select public.refresh_report_stats()$$);
select cron.schedule('retention',      '0 19 * * *',  $$select public.run_retention()$$);
select cron.schedule('rotate-ip-salt', '0 16 * * *',  $$select private.rotate_ip_salt()$$);

-- Job yang memanggil Edge Function butuh URL proyek dan kunci, disimpan di Vault.
-- Jalankan sekali per lingkungan setelah deploy (lihat README.md bagian "Supabase"):
--
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
--
create or replace function private.invoke_edge(p_name text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key';
  if v_url is null or v_key is null then
    return;
  end if;
  perform net.http_post(
    url := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_key, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule('export-snapshot', '* * * * *', $$select private.invoke_edge('export-snapshot')$$);
select cron.schedule('sync-metrics',    '* * * * *', $$select private.invoke_edge('sync-metrics')$$);


-- ===== 0007_visitors.sql =====
-- Penghitung pengunjung ringan (tanpa data pribadi).
-- Satu perangkat dihitung sekali per hari WITA: hash IP bergaram harian dipakai sebagai kunci
-- dan dibuang setelah 2 hari. Bila sync-metrics (Plausible) aktif, angkanya menimpa penghitung ini.
set search_path = public, extensions;

create table if not exists visit_log (
  day date not null,
  ip_hash text not null,
  primary key (day, ip_hash)
);
alter table visit_log enable row level security;
revoke all on table visit_log from anon, authenticated;

create or replace function register_visit() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ip text := private.request_ip_hash();
begin
  if v_ip is null then
    return jsonb_build_object('ok', false);
  end if;
  insert into visit_log (day, ip_hash)
  values ((now() at time zone 'Asia/Makassar')::date, v_ip)
  on conflict do nothing;
  if found then
    update site_metrics_live set visitors_total = visitors_total + 1, updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function register_visit() from public;
grant execute on function register_visit() to anon, authenticated;

-- Snapshot status kini ikut membawa total pengunjung
create or replace function public_status_snapshot() returns jsonb
language sql stable security definer
set search_path = public
as $$
  with spbu as (
    select s.id from stations s
     where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
  ),
  per_fuel as (
    select sf.fuel_type_id::text as k,
           jsonb_build_array(
             count(*) filter (where sfs.status = 'available'),
             count(*) filter (where sfs.status = 'limited'),
             count(*) filter (where sfs.status = 'empty'),
             count(*) filter (where coalesce(sfs.status, 'unknown') = 'unknown')) as c
      from station_fuels sf
      join spbu on spbu.id = sf.station_id
      left join station_fuel_status sfs
        on sfs.station_id = sf.station_id and sfs.fuel_type_id = sf.fuel_type_id
     group by sf.fuel_type_id
  ),
  overall as (
    select jsonb_build_array(
             count(*) filter (where ss.overall_status = 'available'),
             count(*) filter (where ss.overall_status = 'limited'),
             count(*) filter (where ss.overall_status = 'empty'),
             count(*) filter (where coalesce(ss.overall_status, 'unknown') = 'unknown')) as c
      from spbu left join station_status ss on ss.station_id = spbu.id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'online_now', coalesce((select online_now from site_metrics_live where id = 1), 0),
    'visitors_total', coalesce((select visitors_total from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'read_only', setting_bool('read_only'),
    'summary', coalesce((select jsonb_object_agg(k, c) from per_fuel), '{}'::jsonb)
               || jsonb_build_object('all', (select c from overall)),
    'stations', coalesce((
        select jsonb_agg(station_status_payload(ss.station_id))
          from station_status ss
          join stations s on s.id = ss.station_id
         where s.is_active and s.moderation_status = 'approved'
           and (ss.overall_status <> 'unknown' or ss.queue_level is not null)
      ), '[]'::jsonb),
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                            'level', a.level, 'region_id', a.region_id,
                                            'ends_at', a.ends_at)
                         order by a.level desc, a.starts_at desc)
          from announcements a
         where now() between a.starts_at and a.ends_at
      ), '[]'::jsonb)
  )
$$;

-- Retensi: buang catatan kunjungan lama
create or replace function run_retention() returns void
language sql security definer set search_path = public as $$
  update reports set reporter_location = null
   where reporter_location is not null and created_at < now() - interval '30 days';
  delete from queue_pings where at < now() - interval '24 hours';
  delete from queue_messages where created_at < now() - interval '7 days';
  delete from abuse_events where created_at < now() - interval '90 days';
  delete from visit_log where day < (now() at time zone 'Asia/Makassar')::date - 2;
$$;

revoke execute on function public_status_snapshot() from public;
grant execute on function public_status_snapshot() to anon, authenticated;
revoke execute on function run_retention() from public, anon, authenticated;


-- ===== 0008_visitors_per_device.sql =====
-- Penghitung pengunjung per PERANGKAT.
-- Hitung per IP terlalu rendah di Indonesia: operator seluler memakai CGNAT, sehingga ribuan
-- pengguna berbagi satu alamat IP. Sekarang kuncinya adalah ID acak yang dibuat di perangkat
-- (bukan data pribadi), di-hash dengan garam harian, jadi tidak bisa dilacak antarhari.
-- Hash IP tetap disimpan hanya untuk membatasi penyalahgunaan (maks 300 perangkat baru per IP per hari).
set search_path = public, extensions;

create table if not exists visit_devices (
  day date not null,
  device_key text not null,
  ip_hash text,
  primary key (day, device_key)
);
create index if not exists visit_devices_ip_idx on visit_devices (day, ip_hash);
alter table visit_devices enable row level security;
revoke all on table visit_devices from anon, authenticated;

drop function if exists register_visit();

create or replace function register_visit(p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ip   text := private.request_ip_hash();
  v_salt text;
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Makassar')::date;
begin
  -- Tanpa ID perangkat yang valid, jatuh ke hitung per IP seperti sebelumnya
  if p_device is null or length(p_device) < 16 or length(p_device) > 80 then
    if v_ip is null then
      return jsonb_build_object('ok', false);
    end if;
    insert into visit_log (day, ip_hash) values (v_day, v_ip) on conflict do nothing;
    if found then
      update site_metrics_live set visitors_total = visitors_total + 1, updated_at = now() where id = 1;
    end if;
    return jsonb_build_object('ok', true, 'mode', 'ip');
  end if;

  select salt into v_salt from private.ip_salt where id = 1;
  v_key := encode(extensions.digest(v_salt || p_device, 'sha256'), 'hex');

  insert into visit_devices (day, device_key, ip_hash) values (v_day, v_key, v_ip) on conflict do nothing;
  if found then
    -- Batas penyalahgunaan: satu IP tidak boleh mendaftarkan terlalu banyak perangkat baru dalam sehari
    if v_ip is not null and (select count(*) from visit_devices where day = v_day and ip_hash = v_ip) > 300 then
      delete from visit_devices where day = v_day and device_key = v_key;
      return jsonb_build_object('ok', false, 'code', 'LIMIT');
    end if;
    update site_metrics_live set visitors_total = visitors_total + 1, updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('ok', true, 'mode', 'device');
end;
$$;
revoke execute on function register_visit(text) from public;
grant execute on function register_visit(text) to anon, authenticated;

-- Retensi: buang catatan kunjungan lama
create or replace function run_retention() returns void
language sql security definer set search_path = public as $$
  update reports set reporter_location = null
   where reporter_location is not null and created_at < now() - interval '30 days';
  delete from queue_pings where at < now() - interval '24 hours';
  delete from queue_messages where created_at < now() - interval '7 days';
  delete from abuse_events where created_at < now() - interval '90 days';
  delete from visit_log where day < (now() at time zone 'Asia/Makassar')::date - 2;
  delete from visit_devices where day < (now() at time zone 'Asia/Makassar')::date - 2;
$$;
revoke execute on function run_retention() from public, anon, authenticated;


-- ===== 0009_suggest_place.sql =====
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


-- ===== 0010_active_4h.sql =====
-- Pengguna aktif dalam 4 jam terakhir (angka nyata, bukan perkiraan).
-- Tiap perangkat mengirim "denyut" register_visit() saat situs dibuka dan sekitar tiap 30 menit selama
-- tab terlihat. Denyut hanya memperbarui last_seen; total pengunjung tetap bertambah sekali per hari.
set search_path = public, extensions;

alter table visit_devices add column if not exists last_seen timestamptz not null default now();

create or replace function register_visit(p_device text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ip   text := private.request_ip_hash();
  v_salt text;
  v_key  text;
  v_day  date := (now() at time zone 'Asia/Makassar')::date;
  v_new  boolean;
begin
  -- Tanpa ID perangkat yang valid, jatuh ke hitung per IP seperti sebelumnya
  if p_device is null or length(p_device) < 16 or length(p_device) > 80 then
    if v_ip is null then
      return jsonb_build_object('ok', false);
    end if;
    insert into visit_log (day, ip_hash) values (v_day, v_ip) on conflict do nothing;
    if found then
      update site_metrics_live set visitors_total = visitors_total + 1, updated_at = now() where id = 1;
    end if;
    return jsonb_build_object('ok', true, 'mode', 'ip');
  end if;

  select salt into v_salt from private.ip_salt where id = 1;
  v_key := encode(extensions.digest(v_salt || p_device, 'sha256'), 'hex');

  insert into visit_devices (day, device_key, ip_hash, last_seen) values (v_day, v_key, v_ip, now())
  on conflict (day, device_key) do update set last_seen = now()
  returning (xmax = 0) into v_new;

  if v_new then
    -- Batas penyalahgunaan: satu IP tidak boleh mendaftarkan terlalu banyak perangkat baru dalam sehari
    if v_ip is not null and (select count(*) from visit_devices where day = v_day and ip_hash = v_ip) > 300 then
      delete from visit_devices where day = v_day and device_key = v_key;
      return jsonb_build_object('ok', false, 'code', 'LIMIT');
    end if;
    update site_metrics_live set visitors_total = visitors_total + 1, updated_at = now() where id = 1;
  end if;
  return jsonb_build_object('ok', true, 'mode', 'device');
end;
$$;
revoke execute on function register_visit(text) from public;
grant execute on function register_visit(text) to anon, authenticated;

-- Snapshot status membawa active_4h: perangkat unik yang aktif dalam 4 jam terakhir
create or replace function public_status_snapshot() returns jsonb
language sql stable security definer
set search_path = public
as $$
  with spbu as (
    select s.id from stations s
     where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
  ),
  per_fuel as (
    select sf.fuel_type_id::text as k,
           jsonb_build_array(
             count(*) filter (where sfs.status = 'available'),
             count(*) filter (where sfs.status = 'limited'),
             count(*) filter (where sfs.status = 'empty'),
             count(*) filter (where coalesce(sfs.status, 'unknown') = 'unknown')) as c
      from station_fuels sf
      join spbu on spbu.id = sf.station_id
      left join station_fuel_status sfs
        on sfs.station_id = sf.station_id and sfs.fuel_type_id = sf.fuel_type_id
     group by sf.fuel_type_id
  ),
  overall as (
    select jsonb_build_array(
             count(*) filter (where ss.overall_status = 'available'),
             count(*) filter (where ss.overall_status = 'limited'),
             count(*) filter (where ss.overall_status = 'empty'),
             count(*) filter (where coalesce(ss.overall_status, 'unknown') = 'unknown')) as c
      from spbu left join station_status ss on ss.station_id = spbu.id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'online_now', coalesce((select online_now from site_metrics_live where id = 1), 0),
    'active_4h', (select count(distinct device_key) from visit_devices where last_seen > now() - interval '4 hours'),
    'visitors_total', coalesce((select visitors_total from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'read_only', setting_bool('read_only'),
    'summary', coalesce((select jsonb_object_agg(k, c) from per_fuel), '{}'::jsonb)
               || jsonb_build_object('all', (select c from overall)),
    'stations', coalesce((
        select jsonb_agg(station_status_payload(ss.station_id))
          from station_status ss
          join stations s on s.id = ss.station_id
         where s.is_active and s.moderation_status = 'approved'
           and (ss.overall_status <> 'unknown' or ss.queue_level is not null)
      ), '[]'::jsonb),
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                            'level', a.level, 'region_id', a.region_id,
                                            'ends_at', a.ends_at)
                         order by a.level desc, a.starts_at desc)
          from announcements a
         where now() between a.starts_at and a.ends_at
      ), '[]'::jsonb)
  )
$$;
revoke execute on function public_status_snapshot() from public;
grant execute on function public_status_snapshot() to anon, authenticated;


-- ===== 0011_report_counts.sql =====
-- Jumlah laporan 3 jam per SPBU (elemen ke-9 tuple status), laporan 24 jam se-Bali, dan penanda
-- "ditambahkan warga" (elemen ke-13 tuple tempat). Seluruhnya opsional di klien.
set search_path = public, extensions;

create or replace function station_status_payload(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_array(
           s.id,
           coalesce(ss.overall_status, 'unknown'),
           coalesce(ss.is_confirmed, false),
           ss.queue_level,
           ss.wait_min_low,
           ss.wait_min_high,
           ss.last_report_at,
           coalesce((
             select jsonb_agg(jsonb_build_array(f.fuel_type_id, f.status, f.is_confirmed, f.last_report_at)
                              order by f.fuel_type_id)
               from station_fuel_status f
              where f.station_id = s.id and f.status <> 'unknown'
           ), '[]'::jsonb),
           (select count(*) from reports r
             where r.station_id = s.id and r.moderation_status = 'active'
               and r.created_at > now() - interval '3 hours'))
    from stations s
    left join station_status ss on ss.station_id = s.id
   where s.id = p_id
$$;

create or replace function public_places_snapshot() returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'v', 1,
    'generated_at', now(),
    'fuel_types', (select jsonb_agg(jsonb_build_array(id, code, name, brand, is_filter_tab) order by sort_order)
                     from fuel_types),
    'places', (select coalesce(jsonb_agg(jsonb_build_array(
                        s.id, s.slug, s.kind, s.brand, s.spbu_code, s.name,
                        round(st_y(s.location::geometry)::numeric, 6),
                        round(st_x(s.location::geometry)::numeric, 6),
                        s.region_id, s.is_24h,
                        coalesce((select jsonb_agg(sf.fuel_type_id order by sf.fuel_type_id)
                                    from station_fuels sf where sf.station_id = s.id), '[]'::jsonb),
                        s.address,
                        s.source = 'user') order by s.name), '[]'::jsonb)
                 from stations s
                where s.is_active and s.moderation_status = 'approved')
  )
$$;

create or replace function public_status_snapshot() returns jsonb
language sql stable security definer
set search_path = public
as $$
  with spbu as (
    select s.id from stations s
     where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
  ),
  per_fuel as (
    select sf.fuel_type_id::text as k,
           jsonb_build_array(
             count(*) filter (where sfs.status = 'available'),
             count(*) filter (where sfs.status = 'limited'),
             count(*) filter (where sfs.status = 'empty'),
             count(*) filter (where coalesce(sfs.status, 'unknown') = 'unknown')) as c
      from station_fuels sf
      join spbu on spbu.id = sf.station_id
      left join station_fuel_status sfs
        on sfs.station_id = sf.station_id and sfs.fuel_type_id = sf.fuel_type_id
     group by sf.fuel_type_id
  ),
  overall as (
    select jsonb_build_array(
             count(*) filter (where ss.overall_status = 'available'),
             count(*) filter (where ss.overall_status = 'limited'),
             count(*) filter (where ss.overall_status = 'empty'),
             count(*) filter (where coalesce(ss.overall_status, 'unknown') = 'unknown')) as c
      from spbu left join station_status ss on ss.station_id = spbu.id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'online_now', coalesce((select online_now from site_metrics_live where id = 1), 0),
    'active_4h', (select count(distinct device_key) from visit_devices where last_seen > now() - interval '4 hours'),
    'visitors_total', coalesce((select visitors_total from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'reports_24h', (select count(*) from reports where moderation_status = 'active' and created_at > now() - interval '24 hours'),
    'read_only', setting_bool('read_only'),
    'summary', coalesce((select jsonb_object_agg(k, c) from per_fuel), '{}'::jsonb)
               || jsonb_build_object('all', (select c from overall)),
    'stations', coalesce((
        select jsonb_agg(station_status_payload(ss.station_id))
          from station_status ss
          join stations s on s.id = ss.station_id
         where s.is_active and s.moderation_status = 'approved'
           and (ss.overall_status <> 'unknown' or ss.queue_level is not null)
      ), '[]'::jsonb),
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                            'level', a.level, 'region_id', a.region_id,
                                            'ends_at', a.ends_at)
                         order by a.level desc, a.starts_at desc)
          from announcements a
         where now() between a.starts_at and a.ends_at
      ), '[]'::jsonb)
  )
$$;
revoke execute on function public_status_snapshot() from public;
grant execute on function public_status_snapshot() to anon, authenticated;


-- ===== 0012_online_1h.sql =====
-- Online = perangkat unik dengan denyut dalam 1 jam terakhir (menggantikan jendela 4 jam).
set search_path = public, extensions;

create or replace function public_status_snapshot() returns jsonb
language sql stable security definer
set search_path = public
as $$
  with spbu as (
    select s.id from stations s
     where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
  ),
  per_fuel as (
    select sf.fuel_type_id::text as k,
           jsonb_build_array(
             count(*) filter (where sfs.status = 'available'),
             count(*) filter (where sfs.status = 'limited'),
             count(*) filter (where sfs.status = 'empty'),
             count(*) filter (where coalesce(sfs.status, 'unknown') = 'unknown')) as c
      from station_fuels sf
      join spbu on spbu.id = sf.station_id
      left join station_fuel_status sfs
        on sfs.station_id = sf.station_id and sfs.fuel_type_id = sf.fuel_type_id
     group by sf.fuel_type_id
  ),
  overall as (
    select jsonb_build_array(
             count(*) filter (where ss.overall_status = 'available'),
             count(*) filter (where ss.overall_status = 'limited'),
             count(*) filter (where ss.overall_status = 'empty'),
             count(*) filter (where coalesce(ss.overall_status, 'unknown') = 'unknown')) as c
      from spbu left join station_status ss on ss.station_id = spbu.id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'online_now', (select count(distinct device_key) from visit_devices where last_seen > now() - interval '1 hour'),
    'visitors_total', coalesce((select visitors_total from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'reports_24h', (select count(*) from reports where moderation_status = 'active' and created_at > now() - interval '24 hours'),
    'read_only', setting_bool('read_only'),
    'summary', coalesce((select jsonb_object_agg(k, c) from per_fuel), '{}'::jsonb)
               || jsonb_build_object('all', (select c from overall)),
    'stations', coalesce((
        select jsonb_agg(station_status_payload(ss.station_id))
          from station_status ss
          join stations s on s.id = ss.station_id
         where s.is_active and s.moderation_status = 'approved'
           and (ss.overall_status <> 'unknown' or ss.queue_level is not null)
      ), '[]'::jsonb),
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                            'level', a.level, 'region_id', a.region_id,
                                            'ends_at', a.ends_at)
                         order by a.level desc, a.starts_at desc)
          from announcements a
         where now() between a.starts_at and a.ends_at
      ), '[]'::jsonb)
  )
$$;
revoke execute on function public_status_snapshot() from public;
grant execute on function public_status_snapshot() to anon, authenticated;


-- ===== 0013_admin_extra.sql =====
-- Fungsi tambahan untuk panel admin (/admin). Semuanya menolak pengguna non-admin dan menulis admin_audit_log
-- bila mengubah data. Tabel admin sudah bisa dibaca admin lewat kebijakan RLS "admin_read" (0005).
set search_path = public, extensions;

create or replace function admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_flag int := setting_num('dispute_flag_count')::int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object(
    'ok', true,
    'places_pending', (select count(*) from stations where moderation_status = 'quarantined'),
    'places_by_users', (select count(*) from stations where source = 'user'),
    'reports_flagged', (select count(*) from reports r
                         where r.moderation_status = 'active'
                           and (select count(*) from report_votes v where v.report_id = r.id and v.vote = 'dispute') >= v_flag
                           and not exists (select 1 from report_votes v where v.report_id = r.id and v.vote = 'confirm')),
    'reports_quarantined', (select count(*) from reports where moderation_status = 'quarantined'),
    'reports_24h', (select count(*) from reports where created_at > now() - interval '24 hours'),
    'corrections_pending', (select count(*) from station_corrections where status = 'pending'),
    'abuse_24h', (select count(*) from abuse_events where created_at > now() - interval '24 hours'),
    'profiles_blocked', (select count(*) from profiles where is_blocked),
    'read_only', setting_bool('read_only')
  );
end;
$$;

-- Tempat usulan warga / dikarantina
create or replace function admin_list_places(p_filter text default 'quarantined', p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select s.id, s.slug, s.name, s.kind, s.address, s.source, s.moderation_status, s.is_active, s.created_at,
               round(st_y(s.location::geometry)::numeric, 6) as lat,
               round(st_x(s.location::geometry)::numeric, 6) as lng,
               p.pseudonym
          from stations s
          left join profiles p on p.id = s.created_by
         where case p_filter
                 when 'quarantined' then s.moderation_status = 'quarantined'
                 when 'hidden'      then not s.is_active or s.moderation_status in ('hidden', 'rejected')
                 else s.source = 'user'
               end
         order by s.created_at desc
         limit least(coalesce(p_limit, 100), 300)
      ) x), '[]'::jsonb));
end;
$$;

-- Usulan koreksi dari warga
create or replace function admin_list_corrections(p_status text default 'pending', p_limit int default 100)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select c.id, c.created_at, c.kind, c.note, c.status, c.station_id,
               s.name as station_name, s.slug as station_slug,
               round(st_y(s.location::geometry)::numeric, 6) as lat,
               round(st_x(s.location::geometry)::numeric, 6) as lng,
               round(st_y(c.proposed_location::geometry)::numeric, 6) as proposed_lat,
               round(st_x(c.proposed_location::geometry)::numeric, 6) as proposed_lng,
               round(st_distance(s.location, c.proposed_location)) as moved_m,
               p.pseudonym
          from station_corrections c
          join stations s on s.id = c.station_id
          join profiles p on p.id = c.proposed_by
         where c.status = p_status::moderation_status
         order by c.created_at desc
         limit least(coalesce(p_limit, 100), 300)
      ) x), '[]'::jsonb));
end;
$$;

-- Setujui/tolak koreksi. Koreksi lokasi yang disetujui langsung diterapkan; "tutup permanen" yang disetujui
-- menyembunyikan tempat. Jenis lain hanya ditandai selesai (admin mengubahnya lewat Tempat).
create or replace function admin_resolve_correction(p_id uuid, p_status moderation_status)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_c station_corrections;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_status not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS');
  end if;
  update station_corrections set status = p_status where id = p_id and status = 'pending'
  returning * into v_c;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p_status = 'approved' then
    if v_c.kind = 'wrong_location' and v_c.proposed_location is not null then
      update stations set location = v_c.proposed_location, updated_at = now() where id = v_c.station_id;
    elsif v_c.kind = 'closed' then
      update stations set is_active = false, updated_at = now() where id = v_c.station_id;
    end if;
  end if;
  perform private.audit('resolve_correction', 'station_corrections', p_id::text,
                        jsonb_build_object('status', p_status, 'kind', v_c.kind));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function admin_list_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('key', key, 'value', value, 'description', description) order by key)
      from app_settings), '[]'::jsonb));
end;
$$;

create or replace function admin_list_announcements() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (select id, title, body, level, region_id, starts_at, ends_at, created_at
              from announcements order by created_at desc limit 50) a), '[]'::jsonb));
end;
$$;

create or replace function admin_delete_announcement(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  delete from announcements where id = p_id;
  perform private.audit('delete_announcement', 'announcements', p_id::text, null);
  return jsonb_build_object('ok', true);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_overview()',
    'admin_list_places(text, int)',
    'admin_list_corrections(text, int)',
    'admin_resolve_correction(uuid, moderation_status)',
    'admin_list_settings()',
    'admin_list_announcements()',
    'admin_delete_announcement(uuid)',
    'admin_moderation_queue(text, int)',
    'admin_set_report_status(uuid[], moderation_status, text)',
    'admin_block_profile(uuid, boolean, text, boolean)',
    'admin_update_station(uuid, jsonb)',
    'admin_upsert_announcement(jsonb)',
    'admin_set_setting(text, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;


-- ===== 0014_queue.sql =====
-- Pelacak antrean: warga di antrean menekan "Saya di antrean ini"; waktunya diukur, lokasinya dipantau secukupnya,
-- dan saat selesai hasilnya (dapat BBM / habis atau tutup) menjadi laporan. Waktu tunggu yang terukur sudah dipakai
-- recompute_station_status() (queue_sessions.end_reason = 'got_fuel').
set search_path = public, extensions;

alter type queue_end_reason add value if not exists 'empty';

alter table queue_sessions add column if not exists last_ping_at timestamptz not null default now();
create index if not exists queue_sessions_open_idx on queue_sessions (station_id) where ended_at is null;

-- Sesi dianggap berjalan bila ada denyut lokasi dalam 20 menit terakhir
create or replace function private.queue_open_window() returns interval
language sql immutable as $$ select interval '20 minutes' $$;

-- Tuple status: [..., laporan 3 jam, jumlah antre sekarang]
create or replace function station_status_payload(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_array(
           s.id,
           coalesce(ss.overall_status, 'unknown'),
           coalesce(ss.is_confirmed, false),
           ss.queue_level,
           ss.wait_min_low,
           ss.wait_min_high,
           ss.last_report_at,
           coalesce((
             select jsonb_agg(jsonb_build_array(f.fuel_type_id, f.status, f.is_confirmed, f.last_report_at)
                              order by f.fuel_type_id)
               from station_fuel_status f
              where f.station_id = s.id and f.status <> 'unknown'
           ), '[]'::jsonb),
           (select count(*) from reports r
             where r.station_id = s.id and r.moderation_status = 'active'
               and r.created_at > now() - interval '3 hours'),
           (select count(*) from queue_sessions q
             where q.station_id = s.id and q.ended_at is null
               and q.last_ping_at > now() - private.queue_open_window()))
    from stations s
    left join station_status ss on ss.station_id = s.id
   where s.id = p_id
$$;

-- Bagian tambahan snapshot supaya migrasi berikutnya tidak perlu menyalin seluruh fungsi snapshot
create or replace function private.snapshot_extras() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queuing_now', (select count(*) from queue_sessions
                     where ended_at is null and last_ping_at > now() - private.queue_open_window())
  )
$$;

create or replace function public_status_snapshot() returns jsonb
language sql stable security definer
set search_path = public
as $$
  with spbu as (
    select s.id from stations s
     where s.kind = 'spbu' and s.is_active and s.moderation_status = 'approved'
  ),
  per_fuel as (
    select sf.fuel_type_id::text as k,
           jsonb_build_array(
             count(*) filter (where sfs.status = 'available'),
             count(*) filter (where sfs.status = 'limited'),
             count(*) filter (where sfs.status = 'empty'),
             count(*) filter (where coalesce(sfs.status, 'unknown') = 'unknown')) as c
      from station_fuels sf
      join spbu on spbu.id = sf.station_id
      left join station_fuel_status sfs
        on sfs.station_id = sf.station_id and sfs.fuel_type_id = sf.fuel_type_id
     group by sf.fuel_type_id
  ),
  overall as (
    select jsonb_build_array(
             count(*) filter (where ss.overall_status = 'available'),
             count(*) filter (where ss.overall_status = 'limited'),
             count(*) filter (where ss.overall_status = 'empty'),
             count(*) filter (where coalesce(ss.overall_status, 'unknown') = 'unknown')) as c
      from spbu left join station_status ss on ss.station_id = spbu.id
  ),
  active_ids as (
    select ss.station_id as id from station_status ss
     where ss.overall_status <> 'unknown' or ss.queue_level is not null
    union
    select q.station_id from queue_sessions q
     where q.ended_at is null and q.last_ping_at > now() - private.queue_open_window()
  )
  select jsonb_build_object(
    'generated_at', now(),
    'online_now', (select count(distinct device_key) from visit_devices where last_seen > now() - interval '1 hour'),
    'visitors_total', coalesce((select visitors_total from site_metrics_live where id = 1), 0),
    'reports_total', (select count(*) from reports where moderation_status = 'active'),
    'reports_24h', (select count(*) from reports where moderation_status = 'active' and created_at > now() - interval '24 hours'),
    'read_only', setting_bool('read_only'),
    'summary', coalesce((select jsonb_object_agg(k, c) from per_fuel), '{}'::jsonb)
               || jsonb_build_object('all', (select c from overall)),
    'stations', coalesce((
        select jsonb_agg(station_status_payload(s.id))
          from stations s
         where s.id in (select id from active_ids)
           and s.is_active and s.moderation_status = 'approved'
      ), '[]'::jsonb),
    'announcements', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body,
                                            'level', a.level, 'region_id', a.region_id,
                                            'ends_at', a.ends_at)
                         order by a.level desc, a.starts_at desc)
          from announcements a
         where now() between a.starts_at and a.ends_at
      ), '[]'::jsonb)
  ) || private.snapshot_extras()
$$;
revoke execute on function public_status_snapshot() from public;
grant execute on function public_status_snapshot() to anon, authenticated;

-- ───────────────────────── RPC ─────────────────────────

-- Sesi antrean milik pengguna yang masih berjalan (untuk memulihkan setelah halaman dimuat ulang)
create or replace function queue_my_session() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('id', q.id, 'station_id', q.station_id, 'fuel_type_id', q.fuel_type_id,
                              'started_at', q.started_at)
      from queue_sessions q
     where q.profile_id = auth.uid() and q.ended_at is null
       and q.last_ping_at > now() - private.queue_open_window()
     limit 1), 'null'::jsonb)
$$;

create or replace function queue_join(
  p_station_id uuid, p_fuel_type_id smallint,
  p_lat double precision, p_lng double precision, p_accuracy_m real
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid     uuid := auth.uid();
  v_profile profiles;
  v_station stations;
  v_dist    real;
  v_id      uuid;
  v_started timestamptz;
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
  select * into v_station from stations
   where id = p_station_id and is_active and moderation_status = 'approved' and kind <> 'terminal';
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STATION_NOT_FOUND');
  end if;
  if p_accuracy_m is null or p_accuracy_m > setting_num('max_accuracy_m') then
    return jsonb_build_object('ok', false, 'code', 'LOW_ACCURACY');
  end if;
  v_dist := st_distance(v_station.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
  if v_dist > setting_num('geofence_m') then
    return jsonb_build_object('ok', false, 'code', 'OUT_OF_RANGE', 'distance_m', round(v_dist));
  end if;
  if (select count(*) from queue_sessions where profile_id = v_uid and started_at > now() - interval '1 day') >= 12 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMIT_HOURLY');
  end if;
  if p_fuel_type_id is not null and not exists (
       select 1 from station_fuels where station_id = p_station_id and fuel_type_id = p_fuel_type_id) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS');
  end if;

  -- Sesi lama milik pengguna ini ditutup (satu sesi berjalan per pengguna)
  update queue_sessions set ended_at = now(), end_reason = 'timeout'
   where profile_id = v_uid and ended_at is null;

  insert into queue_sessions (station_id, fuel_type_id, profile_id, start_distance_m, last_distance_m)
  values (p_station_id, p_fuel_type_id, v_uid, v_dist, v_dist)
  returning id, started_at into v_id, v_started;
  insert into queue_pings (session_id, distance_m) values (v_id, v_dist);
  update profiles set last_active_at = now() where id = v_uid;
  perform recompute_station_status(p_station_id);
  return jsonb_build_object('ok', true, 'session_id', v_id, 'started_at', v_started);
end;
$$;

-- Denyut lokasi tiap ±60 detik. Bila pengguna menjauh lebih dari 3x radius, sesi berakhir ("left").
create or replace function queue_ping(p_session_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_q    queue_sessions;
  v_dist real;
begin
  select * into v_q from queue_sessions
   where id = p_session_id and profile_id = auth.uid() and ended_at is null;
  if not found then
    return jsonb_build_object('ok', true, 'open', false);
  end if;
  v_dist := st_distance((select location from stations where id = v_q.station_id),
                        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography);
  if v_dist > setting_num('geofence_m') * 3 then
    update queue_sessions set ended_at = now(), end_reason = 'left', last_distance_m = v_dist,
           wait_minutes = least(600, round(extract(epoch from now() - started_at) / 60))::smallint
     where id = v_q.id;
    perform recompute_station_status(v_q.station_id);
    return jsonb_build_object('ok', true, 'open', false);
  end if;
  update queue_sessions set last_ping_at = now(), last_distance_m = v_dist where id = v_q.id;
  insert into queue_pings (session_id, distance_m) values (v_q.id, v_dist) on conflict do nothing;
  return jsonb_build_object('ok', true, 'open', true);
end;
$$;

-- Akhiri sesi. got_fuel dan empty juga dicatat sebagai laporan ketersediaan (lewat submit_report, sehingga
-- semua aturan keamanan yang sama berlaku; bila ditolak, antreannya tetap tercatat).
create or replace function queue_leave(
  p_session_id uuid, p_reason queue_end_reason,
  p_lat double precision default null, p_lng double precision default null, p_accuracy_m real default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_q    queue_sessions;
  v_wait smallint;
  v_lvl  queue_level;
  v_rep  jsonb;
begin
  select * into v_q from queue_sessions
   where id = p_session_id and profile_id = auth.uid() and ended_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_wait := least(600, round(extract(epoch from now() - v_q.started_at) / 60))::smallint;
  update queue_sessions
     set ended_at = now(), end_reason = p_reason, wait_minutes = v_wait,
         last_distance_m = coalesce(
           case when p_lat is not null and p_lng is not null then
             st_distance((select location from stations where id = v_q.station_id),
                         st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography)::real end,
           last_distance_m)
   where id = v_q.id;

  if p_reason in ('got_fuel', 'empty') and v_q.fuel_type_id is not null
     and p_lat is not null and p_lng is not null and p_accuracy_m is not null then
    v_lvl := case when v_wait <= 5 then 'none' when v_wait <= 15 then 'short'
                  when v_wait <= 30 then 'medium' else 'long' end;
    v_rep := submit_report(
      v_q.station_id, p_lat, p_lng, p_accuracy_m,
      jsonb_build_array(jsonb_build_object('fuel_type_id', v_q.fuel_type_id,
                                           'availability', case p_reason when 'got_fuel' then 'available' else 'empty' end)),
      v_lvl, v_wait, null);
  end if;
  perform recompute_station_status(v_q.station_id);
  return jsonb_build_object('ok', true, 'wait_minutes', v_wait, 'reported', coalesce((v_rep->>'ok')::boolean, false));
end;
$$;

-- Sesi tanpa denyut >20 menit ditutup otomatis (ponsel mati, aplikasi ditutup). Waktunya tidak dihitung.
create or replace function queue_expire() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_station uuid;
  v_n int := 0;
begin
  for v_station in
    update queue_sessions set ended_at = last_ping_at, end_reason = 'timeout'
     where ended_at is null and last_ping_at < now() - private.queue_open_window()
    returning station_id
  loop
    v_n := v_n + 1;
    perform recompute_station_status(v_station);
  end loop;
  return v_n;
end;
$$;

select cron.schedule('queue-expire', '* * * * *', $$select public.queue_expire()$$);
select cron.schedule('queue-retention', '30 19 * * *',
  $$delete from public.queue_sessions where started_at < now() - interval '7 days'$$);

revoke execute on function queue_expire() from public, anon, authenticated;
revoke execute on function queue_my_session() from public, anon;
revoke execute on function queue_join(uuid, smallint, double precision, double precision, real) from public, anon;
revoke execute on function queue_ping(uuid, double precision, double precision) from public, anon;
revoke execute on function queue_leave(uuid, queue_end_reason, double precision, double precision, real) from public, anon;
grant execute on function queue_my_session() to authenticated;
grant execute on function queue_join(uuid, smallint, double precision, double precision, real) to authenticated;
grant execute on function queue_ping(uuid, double precision, double precision) to authenticated;
grant execute on function queue_leave(uuid, queue_end_reason, double precision, double precision, real) to authenticated;


-- ===== 0015_corrections.sql =====
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


-- ===== 0016_prices.sql =====
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


-- ===== 0018_geofence_toggle.sql =====
-- Sakelar syarat radius: bila geofence_enabled = false, jarak ke SPBU dan akurasi GPS tidak lagi dibatasi
-- (laporan, validasi, antrean, harga). Berguna di awal peluncuran agar warga mudah menambah data.
-- Caranya: setting_num('geofence_m') dan setting_num('max_accuracy_m') mengembalikan angka sangat besar,
-- sehingga seluruh fungsi yang sudah ada otomatis ikut tanpa diubah.
set search_path = public, extensions;

insert into app_settings (key, value, description) values
 ('geofence_enabled', 'true', 'Wajibkan pelapor berada dalam radius SPBU. Matikan untuk membuka pelaporan dari mana saja.')
on conflict (key) do nothing;

create or replace function setting_num(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select case
           when p_key in ('geofence_m', 'max_accuracy_m')
                and not coalesce((select (value #>> '{}')::boolean from app_settings where key = 'geofence_enabled'), true)
             then 100000000::numeric
           else (select (value #>> '{}')::numeric from app_settings where key = p_key)
         end
$$;

-- Klien perlu tahu agar tidak menolak lebih dulu di sisi pengguna
create or replace function private.snapshot_extras() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queuing_now', (select count(*) from queue_sessions
                     where ended_at is null and last_ping_at > now() - private.queue_open_window()),
    'geofence_enabled', coalesce((select (value #>> '{}')::boolean from app_settings where key = 'geofence_enabled'), true)
  )
$$;


-- ===== 0019_official_prices.sql =====
-- Harga resmi Pertamina (acuan) per kode jenis BBM. Ditampilkan di detail SPBU Pertamina/Pertashop bila belum ada
-- harga dari warga. Bukan data warga: diubah admin lewat /admin (Pengaturan) saat Pertamina mengumumkan harga baru.
-- Nilai awal: harga Bali per 1 Oktober 2026 (detik Bali dan BaliPost, 1 Oktober 2026).
set search_path = public, extensions;

insert into app_settings (key, value, description) values
 ('official_prices',
  '{"asOf": "2026-10-01", "prices": {"pertalite": 10000, "biosolar": 6800, "pertamax": 15950, "pertamax_turbo": 19600, "dexlite": 23700, "pertamina_dex": 25200}}',
  'Harga resmi Pertamina (Rp/liter) per kode BBM, dengan tanggal berlaku. Diubah admin saat harga berganti.')
on conflict (key) do nothing;

create or replace function private.snapshot_extras() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queuing_now', (select count(*) from queue_sessions
                     where ended_at is null and last_ping_at > now() - private.queue_open_window()),
    'geofence_enabled', coalesce((select (value #>> '{}')::boolean from app_settings where key = 'geofence_enabled'), true),
    'official_prices', (select value from app_settings where key = 'official_prices')
  )
$$;


-- ===== 0020_admin_delete_reports.sql =====
-- Admin menghapus laporan palsu secara permanen, apa pun statusnya (termasuk yang sudah tayang dan dihitung).
-- Isi laporan, item BBM, dan suara validasinya ikut terhapus; status SPBU yang terdampak dihitung ulang dan disiarkan.
-- Setiap penghapusan tercatat di admin_audit_log (hanya jumlah dan catatan, bukan isi laporan).
set search_path = public, extensions;

create or replace function admin_delete_reports(p_ids uuid[], p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_stations uuid[];
  v_station  uuid;
  v_n        int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_ITEMS');
  end if;
  select array_agg(distinct station_id) into v_stations from reports where id = any(p_ids);
  delete from reports where id = any(p_ids);
  get diagnostics v_n = row_count;
  foreach v_station in array coalesce(v_stations, '{}'::uuid[]) loop
    perform recompute_station_status(v_station);
  end loop;
  perform private.audit('delete_reports', 'reports', array_to_string(p_ids, ','),
                        jsonb_build_object('note', p_note, 'deleted', v_n));
  return jsonb_build_object('ok', true, 'deleted', v_n);
end;
$$;

-- Hapus semua laporan satu pelapor dalam N jam terakhir (untuk spam berulang). Tidak memblokir pelapor.
create or replace function admin_delete_profile_reports(p_profile uuid, p_hours int default 24)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select array_agg(id) into v_ids from reports
   where reporter_id = p_profile
     and created_at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720));
  if v_ids is null then
    return jsonb_build_object('ok', true, 'deleted', 0);
  end if;
  return admin_delete_reports(v_ids, 'semua laporan pelapor ' || p_profile::text);
end;
$$;

revoke execute on function admin_delete_reports(uuid[], text) from public, anon;
grant execute on function admin_delete_reports(uuid[], text) to authenticated;
revoke execute on function admin_delete_profile_reports(uuid, int) from public, anon;
grant execute on function admin_delete_profile_reports(uuid, int) to authenticated;


-- ===== 0021_longer_status_memory.sql =====
-- Status SPBU bertahan lebih lama di awal peluncuran, saat laporan masih jarang.
-- Sebelumnya satu laporan memudar menjadi "belum ada laporan" setelah ±96 menit (bobot exp(-umur/60) < 0,2),
-- padahal daftar "Laporan terbaru" masih menampilkannya 24 jam. Sekarang satu laporan tetap terbaca ±3,8 jam
-- (bobot exp(-umur/120) >= 0,15), dan klien menandainya "Mungkin sudah berubah" setelah 90 menit.
-- Nilai bisa disetel lagi kapan saja di /admin → Pengaturan.
set search_path = public, extensions;

update app_settings set value = '240',  updated_at = now() where key = 'status_window_min';
update app_settings set value = '120',  updated_at = now() where key = 'decay_tau_min';
update app_settings set value = '0.15', updated_at = now() where key = 'min_weight';

-- Peluruhan berkala ikut jendela baru (sebelumnya tetap 3 jam)
create or replace function decay_all_statuses() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n  int := 0;
  v_window interval := make_interval(mins => setting_num('status_window_min')::int);
begin
  for v_id in
    select station_id from reports where created_at > now() - v_window
    union
    select station_id from station_status where overall_status <> 'unknown' or queue_level is not null
  loop
    perform recompute_station_status(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function decay_all_statuses() from public, anon, authenticated;

-- Hitung ulang sekarang juga, supaya laporan yang sudah masuk langsung terbaca
select decay_all_statuses();


-- ===== 0022_status_24h.sql =====
-- Status SPBU bertahan sampai 24 jam sejak laporan terakhir (jendela 1440 menit).
-- Peluruhan 360 menit: laporan 6 jam lalu masih berbobot 0,37 dibanding laporan baru, jadi laporan terbaru tetap
-- menang bila bertentangan dengan yang lama. Ambang 0,015 supaya satu laporan lolos sampai batas 24 jam
-- (exp(-1440/360) = 0,018). Klien menandai laporan lebih dari 90 menit sebagai "Mungkin sudah berubah".
-- Setel kapan saja di /admin → Pengaturan (status_window_min, decay_tau_min, min_weight).
set search_path = public, extensions;

update app_settings set value = '1440',  updated_at = now() where key = 'status_window_min';
update app_settings set value = '360',   updated_at = now() where key = 'decay_tau_min';
update app_settings set value = '0.015', updated_at = now() where key = 'min_weight';

-- Hitung ulang sekarang juga (decay_all_statuses sudah mengikuti status_window_min sejak 0021)
select decay_all_statuses();


-- ===== 0023_admin_report_origin.sql =====
-- Asal laporan untuk admin.
-- 1) IP pelapor TIDAK tersimpan: hanya hash SHA-256 bergaram harian (garam berganti 00.00 WITA). Admin melihat "kunci IP"
--    (10 karakter pertama hash) dan jumlah laporan dari kunci yang sama dalam 24 jam, serta bisa menyaring semua laporan
--    dari kunci itu. Antarhari kunci berbeda, jadi tidak bisa dilacak lintas hari dan IP asli tidak bisa dipulihkan.
-- 2) Koordinat pelapor (dibulatkan ±11 m, dihapus setelah 30 hari oleh run_retention) diambil hanya atas permintaan admin
--    lewat admin_report_location(), dan setiap pengambilan dicatat di admin_audit_log.
set search_path = public, extensions;

drop function if exists admin_moderation_queue(text, int);

create or replace function admin_moderation_queue(p_filter text default 'flagged', p_limit int default 100, p_ip text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_flag int := setting_num('dispute_flag_count')::int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select r.id, r.created_at, r.station_id, s.name as station_name, r.moderation_status,
               r.quarantine_reason, r.queue_level, r.wait_minutes, r.note, round(r.distance_m) as distance_m,
               r.accuracy_m, r.reporter_id, p.pseudonym, p.is_blocked, p.report_count, p.disputed_count,
               left(r.ip_hash, 10) as ip_key,
               case when r.ip_hash is null then null
                    else (select count(*) from reports r2
                           where r2.ip_hash = r.ip_hash and r2.created_at > now() - interval '24 hours') end as ip_reports_24h,
               (r.reporter_location is not null) as has_location,
               (select jsonb_agg(jsonb_build_array(ri.fuel_type_id, ri.availability)) from report_items ri
                 where ri.report_id = r.id) as items,
               v.confirms, v.disputes
          from reports r
          join stations s on s.id = r.station_id
          join profiles p on p.id = r.reporter_id
          cross join lateral (
            select count(*) filter (where vote = 'confirm') as confirms,
                   count(*) filter (where vote = 'dispute') as disputes
              from report_votes where report_id = r.id
          ) v
         where case
                 when p_ip is not null then left(r.ip_hash, 10) = p_ip and r.created_at > now() - interval '7 days'
                 else case p_filter
                        when 'flagged'     then r.moderation_status = 'active' and v.disputes >= v_flag and v.confirms = 0
                        when 'quarantined' then r.moderation_status = 'quarantined'
                        when 'hidden'      then r.moderation_status = 'hidden'
                        else r.created_at > now() - interval '24 hours'
                      end
               end
         order by r.created_at desc
         limit least(coalesce(p_limit, 100), 500)
      ) x), '[]'::jsonb));
end;
$$;

-- Koordinat tempat pelapor berada saat melapor, plus koordinat SPBU untuk perbandingan. Tercatat di log audit.
create or replace function admin_report_location(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select rp.id, rp.created_at, rp.distance_m, rp.accuracy_m,
         st_y(rp.reporter_location::geometry) as lat, st_x(rp.reporter_location::geometry) as lng,
         st_y(s.location::geometry) as station_lat, st_x(s.location::geometry) as station_lng
    into r
    from reports rp join stations s on s.id = rp.station_id
   where rp.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if r.lat is null then
    -- Koordinat dihapus setelah 30 hari (privasi) atau tidak pernah tersimpan
    return jsonb_build_object('ok', false, 'code', 'NO_LOCATION');
  end if;
  perform private.audit('view_reporter_location', 'reports', p_id::text, null);
  return jsonb_build_object('ok', true, 'lat', r.lat, 'lng', r.lng, 'station_lat', r.station_lat, 'station_lng', r.station_lng,
                            'distance_m', round(r.distance_m), 'accuracy_m', round(r.accuracy_m), 'created_at', r.created_at);
end;
$$;

revoke execute on function admin_moderation_queue(text, int, text) from public, anon;
grant execute on function admin_moderation_queue(text, int, text) to authenticated;
revoke execute on function admin_report_location(uuid) from public, anon;
grant execute on function admin_report_location(uuid) to authenticated;


-- ===== 0024_admin_reports_map.sql =====
-- Peta lokasi pelapor untuk admin: titik tempat tiap laporan dibuat, dihubungkan garis putus-putus ke SPBU-nya.
-- Hanya laporan yang koordinatnya masih tersimpan (30 hari). Satu catatan di admin_audit_log per pemuatan peta
-- (jumlah titik dan saringan), supaya akses ke data lokasi tetap terlacak.
set search_path = public, extensions;

create or replace function admin_reports_map(
  p_filter text default 'recent',
  p_ip text default null,
  p_hours int default 24,
  p_limit int default 300
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_flag int := setting_num('dispute_flag_count')::int;
  v_rows jsonb;
  v_n int;
begin
  if not is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb), count(*)
    into v_rows, v_n
    from (
      select r.id, r.created_at, s.name as station_name, r.moderation_status,
             round(r.distance_m) as distance_m, round(r.accuracy_m) as accuracy_m,
             p.pseudonym, left(r.ip_hash, 10) as ip_key,
             st_y(r.reporter_location::geometry) as lat, st_x(r.reporter_location::geometry) as lng,
             st_y(s.location::geometry) as station_lat, st_x(s.location::geometry) as station_lng
        from reports r
        join stations s on s.id = r.station_id
        join profiles p on p.id = r.reporter_id
       where r.reporter_location is not null
         and case
               when p_ip is not null then left(r.ip_hash, 10) = p_ip and r.created_at > now() - interval '7 days'
               else case p_filter
                      when 'flagged'     then r.moderation_status = 'active'
                                              and (select count(*) from report_votes v where v.report_id = r.id and v.vote = 'dispute') >= v_flag
                                              and not exists (select 1 from report_votes v where v.report_id = r.id and v.vote = 'confirm')
                      when 'quarantined' then r.moderation_status = 'quarantined'
                      when 'hidden'      then r.moderation_status = 'hidden'
                      else r.created_at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720))
                    end
             end
       order by r.created_at desc
       limit least(coalesce(p_limit, 300), 1000)
    ) x;
  perform private.audit('view_reporter_map', 'reports', 'map',
                        jsonb_build_object('count', v_n, 'filter', p_filter, 'ip', p_ip));
  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

revoke execute on function admin_reports_map(text, text, int, int) from public, anon;
grant execute on function admin_reports_map(text, text, int, int) to authenticated;


