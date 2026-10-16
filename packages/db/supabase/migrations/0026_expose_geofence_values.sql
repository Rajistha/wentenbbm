-- Klien membaca jarak maksimal (geofence_m) dan akurasi GPS terburuk (max_accuracy_m) dari snapshot status, jadi angka
-- "300 m" di teks, pemeriksaan di klien, dan panel admin otomatis mengikuti pengaturan di /admin → Pengaturan.
-- Yang dibagikan adalah nilai tersimpan di app_settings (bukan setting_num, yang bisa berubah saat syarat radius mati).
set search_path = public, extensions;

create or replace function private.snapshot_extras() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queuing_now', (select count(*) from queue_sessions
                     where ended_at is null and last_ping_at > now() - private.queue_open_window()),
    'geofence_enabled', coalesce((select (value #>> '{}')::boolean from app_settings where key = 'geofence_enabled'), true),
    'geofence_m', coalesce((select (value #>> '{}')::numeric from app_settings where key = 'geofence_m'), 300),
    'max_accuracy_m', coalesce((select (value #>> '{}')::numeric from app_settings where key = 'max_accuracy_m'), 100),
    'official_prices', (select value from app_settings where key = 'official_prices')
  )
$$;
