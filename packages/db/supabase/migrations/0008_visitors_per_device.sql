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
