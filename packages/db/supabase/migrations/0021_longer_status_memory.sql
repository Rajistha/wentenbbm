-- Status SPBU bertahan lebih lama di awal peluncuran, saat laporan masih jarang.
-- Sebelumnya satu laporan memudar menjadi "belum ada laporan" setelah ±96 menit (bobot exp(-umur/60) < 0,2),
-- padahal daftar "Laporan terbaru" masih menampilkannya 24 jam. Sekarang satu laporan tetap terbaca ±3,8 jam
-- (bobot exp(-umur/120) >= 0,15), dan klien menandainya "Mungkin sudah berubah" setelah 90 menit.
-- Nilai bisa disetel lagi kapan saja di /admin → Pengaturan.
set search_path = public, extensions;

update app_settings set value = '240',  updated_at = now() where key = 'status_window_min';
update app_settings set value = '120',  updated_at = now() where key = 'decay_tau_min';
update app_settings set value = '0.15', updated_at = now() where key = 'min_weight';

-- Peluruhan berkala ikut jendela baru (sebelumnya tetap 3 jam)
create or replace function decay_all_statuses() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n  int := 0;
  v_window interval := make_interval(mins => setting_num('status_window_min')::int);
begin
  for v_id in
    select station_id from reports where created_at > now() - v_window
    union
    select station_id from station_status where overall_status <> 'unknown' or queue_level is not null
  loop
    perform recompute_station_status(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function decay_all_statuses() from public, anon, authenticated;

-- Hitung ulang sekarang juga, supaya laporan yang sudah masuk langsung terbaca
select decay_all_statuses();
