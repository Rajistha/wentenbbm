-- Status SPBU bertahan sampai 24 jam sejak laporan terakhir (jendela 1440 menit).
-- Peluruhan 360 menit: laporan 6 jam lalu masih berbobot 0,37 dibanding laporan baru, jadi laporan terbaru tetap
-- menang bila bertentangan dengan yang lama. Ambang 0,015 supaya satu laporan lolos sampai batas 24 jam
-- (exp(-1440/360) = 0,018). Klien menandai laporan lebih dari 90 menit sebagai "Mungkin sudah berubah".
-- Setel kapan saja di /admin → Pengaturan (status_window_min, decay_tau_min, min_weight).
set search_path = public, extensions;

update app_settings set value = '1440',  updated_at = now() where key = 'status_window_min';
update app_settings set value = '360',   updated_at = now() where key = 'decay_tau_min';
update app_settings set value = '0.015', updated_at = now() where key = 'min_weight';

-- Hitung ulang sekarang juga (decay_all_statuses sudah mengikuti status_window_min sejak 0021)
select decay_all_statuses();
