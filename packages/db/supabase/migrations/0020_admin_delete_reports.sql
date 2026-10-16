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
