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
