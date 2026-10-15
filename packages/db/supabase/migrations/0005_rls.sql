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
