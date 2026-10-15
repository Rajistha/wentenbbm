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
