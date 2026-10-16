-- Lokasi pelapor selalu wajib, juga saat syarat radius dimatikan.
-- Sebelumnya klien memakai koordinat SPBU itu sendiri bila lokasi pengguna tidak ada, sehingga lokasi pelapor di admin
-- tampak "tepat di SPBU" padahal pelapor jauh (mis. di Malang). Sekarang submit_report menolak laporan tanpa lat/lng
-- (kode LOW_ACCURACY) dan hanya memakai koordinat yang dikirim pengguna. Syarat radius mati tetap berarti jarak dan akurasi
-- tidak dibatasi (setting_num mengembalikan angka besar, lihat 0018), tetapi koordinatnya tetap disimpan.
-- Fungsi ini salinan submit_report dari 0004 dengan perubahan hanya pada penanganan lokasi.
set search_path = public, extensions;

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
  v_known    boolean := p_lat is not null and p_lng is not null;
  v_point    geography;
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

  -- Lokasi selalu wajib
  if not v_known then
    return jsonb_build_object('ok', false, 'code', 'LOW_ACCURACY');
  end if;

  v_point := st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;

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

revoke execute on function submit_report(uuid, double precision, double precision, real, jsonb, queue_level, smallint, text) from public, anon;
grant execute on function submit_report(uuid, double precision, double precision, real, jsonb, queue_level, smallint, text) to authenticated;

-- Bersihkan laporan yang dibuat dengan koordinat pengganti = titik SPBU (akurasi 25 m, jarak ~0 m):
-- lokasinya tidak diketahui, bukan "tepat di SPBU".
update reports
   set reporter_location = null, distance_m = -1, accuracy_m = -1
 where reporter_location is not null and accuracy_m = 25 and distance_m < 2;
