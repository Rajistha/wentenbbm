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
