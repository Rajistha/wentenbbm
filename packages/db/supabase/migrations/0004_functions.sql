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
