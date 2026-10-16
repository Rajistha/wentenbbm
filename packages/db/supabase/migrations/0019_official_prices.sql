-- Harga resmi Pertamina (acuan) per kode jenis BBM. Ditampilkan di detail SPBU Pertamina/Pertashop bila belum ada
-- harga dari warga. Bukan data warga: diubah admin lewat /admin (Pengaturan) saat Pertamina mengumumkan harga baru.
-- Nilai awal: harga Bali per 1 Oktober 2026 (detik Bali dan BaliPost, 1 Oktober 2026).
set search_path = public, extensions;

insert into app_settings (key, value, description) values
 ('official_prices',
  '{"asOf": "2026-10-01", "prices": {"pertalite": 10000, "biosolar": 6800, "pertamax": 15950, "pertamax_turbo": 19600, "dexlite": 23700, "pertamina_dex": 25200}}',
  'Harga resmi Pertamina (Rp/liter) per kode BBM, dengan tanggal berlaku. Diubah admin saat harga berganti.')
on conflict (key) do nothing;

create or replace function private.snapshot_extras() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'queuing_now', (select count(*) from queue_sessions
                     where ended_at is null and last_ping_at > now() - private.queue_open_window()),
    'geofence_enabled', coalesce((select (value #>> '{}')::boolean from app_settings where key = 'geofence_enabled'), true),
    'official_prices', (select value from app_settings where key = 'official_prices')
  )
$$;
