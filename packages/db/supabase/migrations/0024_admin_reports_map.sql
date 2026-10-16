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
