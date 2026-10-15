-- Data referensi yang wajib ada di semua lingkungan (ERD.md bagian 6).

insert into regions (id, slug, name, kind) values
 (1,'denpasar','Kota Denpasar','kota'),
 (2,'badung','Badung','kabupaten'),
 (3,'gianyar','Gianyar','kabupaten'),
 (4,'tabanan','Tabanan','kabupaten'),
 (5,'jembrana','Jembrana','kabupaten'),
 (6,'buleleng','Buleleng','kabupaten'),
 (7,'bangli','Bangli','kabupaten'),
 (8,'klungkung','Klungkung','kabupaten'),
 (9,'karangasem','Karangasem','kabupaten');

-- id 1-9 Pertamina, 11+ Shell, 21+ BP, 31+ Vivo
insert into fuel_types (id, code, name, brand, category, ron, is_subsidized, is_filter_tab, sort_order) values
 (1,  'pertalite',         'Pertalite',          'pertamina', 'bensin', 90, true,  true,  1),
 (2,  'pertamax',          'Pertamax',           'pertamina', 'bensin', 92, false, true,  2),
 (3,  'pertamax_turbo',    'Pertamax Turbo',     'pertamina', 'bensin', 98, false, false, 4),
 (4,  'pertamax_green',    'Pertamax Green',     'pertamina', 'bensin', 95, false, false, 5),
 (5,  'biosolar',          'Solar',              'pertamina', 'diesel', null, true, true,  3),
 (6,  'dexlite',           'Dexlite',            'pertamina', 'diesel', null, false, false, 6),
 (7,  'pertamina_dex',     'Pertamina Dex',      'pertamina', 'diesel', null, false, false, 7),
 (11, 'shell_super',       'Shell Super',        'shell',     'bensin', 92, false, false, 20),
 (12, 'shell_vpower',      'Shell V-Power',      'shell',     'bensin', 95, false, false, 21),
 (13, 'shell_vpower_diesel','Shell V-Power Diesel','shell',   'diesel', null, false, false, 22),
 (21, 'bp_92',             'BP 92',              'bp',        'bensin', 92, false, false, 30),
 (22, 'bp_ultimate',       'BP Ultimate',        'bp',        'bensin', 95, false, false, 31),
 (23, 'bp_ultimate_diesel','BP Ultimate Diesel', 'bp',        'diesel', null, false, false, 32),
 (31, 'vivo_revvo90',      'Revvo 90',           'vivo',      'bensin', 90, false, false, 40),
 (32, 'vivo_revvo92',      'Revvo 92',           'vivo',      'bensin', 92, false, false, 41),
 (33, 'vivo_revvo95',      'Revvo 95',           'vivo',      'bensin', 95, false, false, 42);

insert into app_settings (key, value, description) values
 ('status_window_min',    '120',   'Jendela laporan yang dihitung (menit)'),
 ('decay_tau_min',        '60',    'Konstanta peluruhan (menit)'),
 ('min_weight',           '0.2',   'Ambang total bobot sebelum status menjadi unknown'),
 ('confirm_window_min',   '30',    'Jendela untuk tanda dikonfirmasi warga'),
 ('geofence_m',           '300',   'Jarak maksimal pelapor ke SPBU (meter)'),
 ('max_accuracy_m',       '100',   'Akurasi GPS terburuk yang diterima (meter)'),
 ('station_cooldown_min', '30',    'Jeda lapor per SPBU per perangkat (menit)'),
 ('hourly_report_limit',  '6',     'Maksimal laporan per perangkat per jam'),
 ('ip_hourly_limit',      '40',    'Maksimal laporan per hash IP per jam sebelum karantina'),
 ('queue_window_min',     '60',    'Jendela tingkat antrean dan waktu tunggu (menit)'),
 ('dispute_flag_count',   '3',     'Jumlah bantahan tanpa konfirmasi sebelum masuk antrean moderasi'),
 ('read_only',            'false', 'Mode baca-saja darurat');

insert into site_metrics_live (id, online_now, visitors_total, launched_at) values (1, 0, 0, now());

-- Garam hash IP harian (ARCHITECTURE.md 4.4), dirotasi oleh job rotate-ip-salt
create table private.ip_salt (
  id smallint primary key default 1 check (id = 1),
  salt text not null,
  rotated_at timestamptz not null default now()
);
insert into private.ip_salt (salt) values (encode(extensions.gen_random_bytes(32), 'hex'));
