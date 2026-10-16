# Operasional Wenten BBM

Panduan singkat untuk pengelola. Semua langkah di bawah dilakukan di dasbor, bukan di kode.

## 1. Menjadikan akun sebagai admin

1. Supabase → *Authentication → Users → Add user → Create new user*. Isi email dan kata sandi, centang *Auto Confirm User*.
2. Buka *SQL Editor*, jalankan (ganti emailnya):

```sql
insert into profiles (id, role, pseudonym)
select id, 'admin', 'Admin'
  from auth.users
 where email = 'email-admin@contoh.com'
on conflict (id) do update set role = 'admin';
```

3. Buka `https://wentenbbm.site/admin`, masuk dengan email dan kata sandi tadi.

Panel admin berisi: ringkasan, moderasi laporan (sembunyikan, pulihkan, blokir pelapor), tempat usulan warga
(setujui, ubah nama, tolak), koreksi dari warga, pengumuman, dan pengaturan (termasuk tombol hentikan pelaporan).
Setiap perubahan tercatat di tabel `admin_audit_log`.

## 2. Captcha (Cloudflare Turnstile)

Site key sudah ada di `.env.local` dan Vercel (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`). Pasangannya, **secret key**,
harus dimasukkan di Supabase: *Authentication → Attack Protection → Enable CAPTCHA protection → Cloudflare Turnstile*.
Tanpa langkah ini captcha hanya tampil di sisi pengguna dan tidak diperiksa server.

Setelah mengaktifkannya, uji: kirim satu laporan dan masuk ke `/admin`. Keduanya memakai token Turnstile.

## 3. Pemantauan

- `GET /api/health` mengembalikan 200 bila situs dan database sehat, 503 bila database bermasalah.
- Daftarkan `https://wentenbbm.site/api/health` di UptimeRobot (gratis, cek tiap 5 menit) dengan notifikasi email atau Telegram.
- Pantau juga kuota TomTom (lalu lintas) di dasbor TomTom Developer; batas harian di aplikasi: `TOMTOM_DAILY_BUDGET`.
- Vercel → *Analytics* dan *Speed Insights* sudah aktif. Supabase → *Reports* untuk beban database.

## 4. Migrasi database

Berkas ada di `packages/db/supabase/migrations/`. Jalankan berurutan di SQL Editor, sekali per berkas.
`all-migrations.sql` hanya untuk proyek baru yang masih kosong (0001 sampai terbaru).

| Berkas | Isi |
|---|---|
| 0007–0008 | Penghitung pengunjung per perangkat |
| 0009 | Tambah Tempat (Pertamini/Pertashop) |
| 0010 | Denyut perangkat (`last_seen`) |
| 0011 | Laporan 3 jam, laporan 24 jam, penanda "ditambahkan warga" |
| 0012 | "Online" = perangkat aktif 1 jam terakhir |
| 0013 | Fungsi tambahan panel admin |
| 0014 | Pelacak antrean |
| 0015 | Usulan koreksi dari warga |
| 0016 | Harga BBM dari warga |
| 0018 | Sakelar syarat radius 300 m (tab Ringkasan di /admin) |
| 0019 | Harga resmi Pertamina sebagai acuan (tab Pengaturan di /admin) |
| 0020 | Admin menghapus laporan palsu secara permanen (tab Laporan) |
| 0021 | Fungsi peluruhan mengikuti jendela status; nilai awal 4 jam |
| 0022 | Status SPBU bertahan sampai 24 jam (jendela 1440, peluruhan 360, ambang 0,015); setel di /admin → Pengaturan |

## 5. Syarat radius 300 m

Di `/admin` → Ringkasan ada tombol **Matikan syarat radius**. Saat mati, warga bisa melapor, memvalidasi, mengukur antrean, dan mengisi harga dari mana saja
(jarak dan akurasi GPS tidak diperiksa). Berguna di awal peluncuran, tapi laporan jadi lebih mudah dipalsukan; aktifkan kembali saat
laporan sudah ramai. Perubahan terlihat di klien dalam hitungan detik sampai satu menit (mengikuti cache status).

## 6. Catatan fitur

- **Pelacak antrean.** Sesi tanpa denyut lokasi 20 menit ditutup otomatis (pg_cron `queue-expire`), dan waktunya tidak dihitung.
  Denyut hanya dikirim saat tab terlihat, jadi pengguna yang mengunci layar lama tidak terukur.
- **Favorit.** Tersimpan di perangkat. Pemberitahuan hanya muncul saat aplikasi dibuka; tidak ada notifikasi push saat aplikasi tertutup
  (itu butuh server push: kunci VAPID, tabel langganan, dan fungsi pengirim).
- **Poster QR.** `/poster` dan `/poster?spbu=<slug>`; tombol cetak memakai ukuran A4.
