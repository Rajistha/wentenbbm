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
