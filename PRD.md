# PRD: Wenten BBM, Warga Bantu Warga

| | |
|---|---|
| Nama produk | Wenten BBM (bahasa Bali: "ada BBM"), tagline: "Semeton bantu semeton cek BBM Bali" (semeton = saudara/sesama dalam bahasa Bali) |
| Versi dokumen | 1.0 (draf) |
| Tanggal | 15 Oktober 2026 |
| Status | Siap ditinjau |
| Keputusan arsitektur | Stack A (Next.js + Supabase + Vercel), peta Opsi 1 (MapLibre + OpenStreetMap, navigasi lewat Google Maps), kepercayaan Level 1 (anonim + pengaman), monorepo |
| Dokumen terkait | `DESIGN.md`, `ERD.md`, `ARCHITECTURE.md` |

---

## 1. Ringkasan

Wenten BBM adalah website (PWA) yang menampilkan **SPBU mana yang saat ini masih punya stok BBM, berdasarkan laporan warga yang sedang berada di lokasi**. Warga melihat peta dan daftar SPBU terdekat, membuka detail SPBU, lalu menekan "Arahkan" untuk navigasi. Warga yang sedang berada di SPBU bisa mengirim laporan stok per jenis BBM dalam kurang dari 15 detik.

Status yang ditampilkan bukan laporan terakhir mentah, melainkan hasil perhitungan dari laporan beberapa jam terakhir yang diberi bobot berdasarkan kesegaran dan validasi warga lain. Jika tidak ada laporan baru, status otomatis kembali menjadi "Belum ada laporan".

## 2. Latar belakang

Sejak awal Oktober 2026, antrean panjang terjadi di banyak SPBU di Bali. Pertamina Patra Niaga menyebut penyebab awalnya adalah keterlambatan pasokan Pertalite. Kelangkaan kemudian juga menyentuh BBM nonsubsidi seperti Pertamax dan Pertamax Turbo, misalnya di Jembrana, sementara gangguan pasokan juga dilaporkan di Denpasar dan Badung. Pada 13 Oktober, Direktur Utama Pertamina menyampaikan permintaan maaf kepada warga Bali, dan seluruh SPBU diinstruksikan memasang pengumuman ketersediaan stok. Tambahan pasokan dijadwalkan tiba bertahap pada 12, 14, dan 16 Oktober.

Dampaknya di lapangan: warga berkeliling dari satu SPBU ke SPBU lain tanpa tahu mana yang masih ada stok, menghabiskan BBM yang tersisa, dan memperpanjang antrean. Informasi saat ini tersebar di grup WhatsApp dan media sosial, tidak terstruktur, cepat basi, dan sulit diverifikasi.

Kementerian ESDM juga pernah menyebut isu spekulatif dan panic buying sebagai salah satu penyebab kelangkaan BBM. Artinya, **produk ini harus membantu warga menemukan BBM tanpa ikut memicu kepanikan**.

Sumber:
- [detikBali: Bali Krisis BBM, Antrean Horor di Mana-mana](https://www.detik.com/bali/bisnis/d-8704008/bali-krisis-bbm-antrean-horor-di-mana-mana)
- [Katadata: Antrean Beli BBM Sempat Mengular di Bali, Pertamina Akui Pasokan Terlambat](https://katadata.co.id/berita/energi/6ac7604948b2b/antrean-beli-bbm-sempat-mengular-di-bali-pertamina-akui-pasokan-terlambat)
- [iNews: BBM Langka di Bali, Warga Antre Berjam-jam di SPBU Jembrana](https://www.rctiplus.com/news/detail/inews/5492742/bbm-langka-di-bali--warga-antre-berjam-jam-di-spbu-jembrana)
- [Pasardana: Bos Pertamina Minta Maaf dan Beberkan BBM Langka di Bali](https://pasardana.id/news/2026/10/14/bos-pertamina-minta-maaf-dan-beberkan-bbm-langka-di-bali)
- [KabarBursa: IESR Pertanyakan Ketahanan Pasokan Energi](https://www.kabarbursa.com/makro/iesr-pertanyakan-ketahanan-pasokan-energi-di-balik-kelangkaan-bbm-berulang)
- [KabarBursa: ESDM Bongkar Empat Penyebab Kelangkaan BBM](https://www.kabarbursa.com/makro/bbm-langka-di-sejumlah-daerah-esdm-bongkar-empat-penyebabnya)

## 3. Pernyataan masalah

> Warga Bali yang butuh BBM tidak tahu SPBU terdekat mana yang masih punya stok jenis BBM yang mereka butuhkan saat ini, sehingga mereka membuang waktu, BBM, dan memperpanjang antrean di SPBU yang sudah habis.

## 4. Tujuan dan non-tujuan

### Tujuan

1. Warga dapat menemukan SPBU terdekat yang dilaporkan masih punya stok dalam waktu kurang dari 30 detik sejak membuka website.
2. Warga yang berada di SPBU dapat melapor dalam maksimal 3 langkah dan kurang dari 15 detik.
3. Status yang tampil selalu disertai waktu laporan, sehingga warga bisa menilai sendiri kesegarannya.
4. Website tetap cepat dan tidak tumbang saat lonjakan trafik di puncak krisis.
5. Mengurangi peluang laporan palsu tanpa memaksa warga membuat akun.

### Non-tujuan (versi ini)

- Bukan aplikasi resmi Pertamina, Shell, BP, atau Vivo, dan tidak mengklaim data resmi.
- Tidak menampilkan volume stok dalam liter.
- Tidak melacak posisi truk tangki atau memprediksi pasokan tanpa sumber data resmi. Prakiraan pasokan hanya masuk P2 dan hanya jika ada data jadwal resmi.
- Tidak membangun sistem akun, reputasi penuh, atau akun operator terverifikasi (Level 2 dan 3), tetapi database sudah disiapkan untuk itu.
- Tidak membangun aplikasi native Android/iOS.

## 5. Pengguna

| Persona | Gambaran | Kebutuhan utama |
|---|---|---|
| **Made, komuter motor** | Pekerja di Denpasar, berangkat pagi, BBM tinggal sedikit | Cari SPBU terdekat yang ada Pertalite, langsung jalan |
| **Komang, pengemudi ojol** | Seharian di jalan, sangat bergantung pada BBM | Tahu cepat SPBU mana yang antreannya pendek, sering lewat banyak SPBU sehingga berpotensi jadi pelapor aktif |
| **Sarah, wisatawan** | Menyewa motor di Canggu, tidak kenal daerah, berbahasa Inggris | Peta yang jelas, navigasi satu ketukan, antarmuka bahasa Inggris |
| **Pak Wayan, relawan banjar** | Ingin membantu warga sekitar | Melapor rutin dari SPBU di wilayahnya, membagikan tautan SPBU ke grup WhatsApp |
| **Admin/moderator** | Tim pengelola proyek | Menyembunyikan laporan palsu, memperbaiki data SPBU, memasang pengumuman resmi |

## 6. Ruang lingkup

### MVP (P0), target rilis 7 hari

- Peta interaktif **penuh layar** seluruh Bali, dengan kontrol mengambang di atas peta (lihat `DESIGN.md` bagian 7).
- Penanda SPBU dengan bentuk dan tingkat warna sesuai status, plus tanda **"Dikonfirmasi warga"** bila minimal 2 pelapor berbeda sepakat dalam 30 menit terakhir.
- Ringkasan se-Bali secara langsung, misalnya "97 dari 308 SPBU dilaporkan ada Pertalite", dengan indikator "Langsung, diperbarui 20 detik lalu" dan jumlah pengguna online.
- Tombol satu ketukan **"Terdekat yang ada BBM"** yang langsung memusatkan peta ke SPBU tersedia terdekat dan membuka detailnya.
- Legenda peta yang bisa dibuka dan ditutup.
- Pertanyaan opsional "Berapa lama Anda antre?" di form laporan, sebagai dasar estimasi waktu antre.
- Bahasa Indonesia dan Inggris sejak awal (hanya teks antarmuka), karena banyak wisatawan menyewa motor.
- **Halaman data publik `/data`**: statistik pengguna dan laporan, laporan per jam, kondisi per kabupaten, ketersediaan layanan, dan catatan gangguan.
- Lokasi pengguna dan tombol "Lokasi saya".
- Daftar SPBU terurut berdasarkan jarak, dengan filter jenis BBM dan "hanya yang tersedia".
- Detail SPBU (popup di desktop, bottom sheet di HP): status per jenis BBM, antrean, waktu laporan terakhir, laporan terbaru.
- Tombol "Arahkan" yang membuka Google Maps dengan tujuan SPBU.
- Form laporan stok dengan validasi lokasi (geofence 300 m).
- Tombol "Masih benar" dan "Sudah tidak benar" pada laporan terbaru (juga dengan geofence).
- Perhitungan status otomatis dengan peluruhan waktu.
- Pembaruan status realtime.
- Pencarian SPBU berdasarkan nama, nomor SPBU, atau kabupaten/kecamatan.
- Banner pengumuman dari admin (misalnya jadwal kedatangan kapal BBM).
- Panel admin dasar: sembunyikan laporan, blokir pelapor, ubah data SPBU, kelola pengumuman.
- PWA: bisa dipasang ke layar utama, menampilkan data terakhir saat offline.
- Tombol "Bagikan" (Web Share API, fallback salin tautan) untuk SPBU tertentu.

### P1, minggu ke-2

- **"Saya di antrean ini"**: pengguna yang sedang antre mengaktifkan mode antre, HP mengukur perubahan jarak ke pompa selama halaman terbuka, dan sistem menghitung estimasi waktu tunggu (misalnya "Sekitar 25 sampai 35 menit") serta jumlah orang yang sedang memantau antrean tersebut. Hanya jarak ke SPBU yang dikirim, bukan koordinat mentah.
- **Kabar antrean**: pesan singkat dari orang yang sedang antre (maksimal 100 karakter, misalnya "Tangki baru datang" atau "Maksimal Rp50 ribu per pengisian"), dengan nama samaran otomatis bernuansa Bali seperti "Jepun 21" atau "Cempaka 07". Pesan hilang otomatis setelah 2 jam.
- **Lapisan pengecer**: Pertashop dan pengecer (Pertamini, botolan) yang ditambahkan warga, tampil dengan penanda berbeda dan bisa dimatikan. Setiap tambahan baru masuk karantina sampai lolos pemeriksaan otomatis atau moderasi.
- **Lapisan terminal BBM (TBBM)**: lokasi depo sebagai titik referensi, tidak bisa dilaporkan.
- **Gambar ringkasan untuk dibagikan** (misalnya "97 dari 308 SPBU ada BBM, 15.40 WITA") dan kode QR ke situs, untuk disebar di grup WhatsApp dan dicetak di banjar.
- Grafik ketersediaan layanan (bar waktu) dan unduhan data agregat CSV di halaman `/data`.
- Foto opsional pada laporan (dikompres, metadata EXIF dihapus).
- Usulan SPBU baru atau koreksi lokasi dari warga.
- Penyesuaian otomatis sederhana untuk skor kepercayaan pelapor (laporan yang sering dibantah menurunkan bobot pelapornya).
- Pencarian tempat umum (misalnya "Kuta", "Ubud") untuk memindahkan peta.
- Rute digambar di dalam peta (OpenRouteService), sebagai pelengkap tombol Google Maps.

### P2, setelah krisis mereda

- Level 2: login (Google atau nomor HP) dan reputasi penuh.
- Level 3: akun operator SPBU dan relawan terverifikasi dengan label khusus.
- Notifikasi "beri tahu saya saat SPBU X tersedia".
- Prakiraan pasokan dengan penggeser waktu (Sekarang, +6 jam, +12 jam, +24 jam), hanya jika ada data jadwal kapal atau distribusi dari sumber resmi, dan selalu diberi label "perkiraan".
- Data riwayat untuk analisis pola kelangkaan per wilayah, dibagikan sebagai data terbuka.
- Perluasan ke provinsi lain.

## 7. User story dan kriteria penerimaan

### US-01 Melihat SPBU terdekat
Sebagai warga, saya ingin melihat SPBU terdekat beserta statusnya agar bisa memutuskan ke mana pergi.

- Saat pertama dibuka, website meminta izin lokasi dengan penjelasan singkat mengapa lokasi dibutuhkan.
- Jika diizinkan, peta berpusat pada lokasi pengguna dengan zoom yang menampilkan radius sekitar 5 km.
- Jika ditolak atau gagal, peta berpusat di Denpasar dan muncul ajakan mencari wilayah secara manual.
- Setiap penanda SPBU menampilkan status keseluruhan dengan bentuk dan warna (tidak hanya warna).
- Peta mengisi seluruh layar. Ringkasan se-Bali tampil di strip status mengambang, dan daftar SPBU dibuka lewat tombol "Daftar" di dock bawah.
- Data awal tampil dalam waktu kurang dari 2,5 detik pada koneksi 4G.

### US-02 Memfilter jenis BBM
Sebagai pengguna Pertalite, saya ingin hanya melihat status Pertalite.

- Filter jenis BBM berupa chip yang bisa digeser horizontal: Semua, Pertalite, Pertamax, Pertamax Turbo, Solar, Dexlite, Pertamina Dex, dan BBM merek lain.
- Saat satu jenis BBM dipilih, warna dan bentuk penanda mencerminkan status jenis BBM tersebut, bukan status keseluruhan.
- SPBU yang tidak menjual jenis BBM tersebut disembunyikan.
- Toggle "Hanya yang tersedia" menyembunyikan SPBU berstatus Habis dan Belum ada laporan.
- Pilihan filter tersimpan di perangkat dan dipulihkan saat kunjungan berikutnya.

### US-03 Melihat detail SPBU
- Mengetuk penanda atau item daftar membuka detail SPBU.
- Detail memuat: nama, nomor SPBU (jika ada), merek, alamat, jarak, jam operasional (24 jam atau tidak), status keseluruhan, status per jenis BBM dengan waktu laporan, tingkat antrean, dan hingga 5 laporan terbaru.
- Setiap waktu ditampilkan relatif ("12 menit lalu") dan absolut dalam WITA saat diketuk.
- Ada label tetap "Laporan warga, bukan data resmi SPBU."

### US-04 Navigasi ke SPBU
- Tombol "Arahkan" membuka `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` di tab atau aplikasi Google Maps.
- Tombol tampil di item daftar dan di detail SPBU.
- Tersedia opsi sekunder "Buka di aplikasi peta lain" (URI `geo:` di Android) dan "Salin koordinat".

### US-05 Melapor stok
Sebagai warga yang sedang di SPBU, saya ingin melaporkan stok dengan cepat.

- Tombol "Lapor stok" aktif hanya jika lokasi pengguna dalam radius 300 m dari SPBU dengan akurasi GPS 100 m atau lebih baik. Jika tidak, tombol tetap tampil tetapi menjelaskan syaratnya.
- Saat pengguna terdeteksi berada di dekat sebuah SPBU, muncul ajakan kontekstual: "Anda di SPBU Kapal? Bantu warga lain, laporkan stok."
- Form berisi: status per jenis BBM yang dijual SPBU tersebut (Ada, Terbatas, Habis, Tidak tahu), tingkat antrean (Tidak ada, Pendek, Sedang, Panjang), catatan opsional maksimal 140 karakter.
- Minimal satu jenis BBM harus diisi selain "Tidak tahu".
- Laporan terkirim dalam satu ketukan "Kirim", status SPBU di peta berubah tanpa memuat ulang halaman.
- Pesan sukses: "Terima kasih, laporan Anda membantu warga lain."
- Pesan galat spesifik untuk: di luar radius, akurasi GPS rendah, terlalu sering melapor, perangkat diblokir, gangguan jaringan (laporan disimpan dan dikirim ulang otomatis saat online, maksimal 10 menit, setelah itu dibuang karena sudah basi).

### US-06 Memvalidasi laporan
- Laporan terbaru menampilkan tombol "Masih benar" dan "Sudah tidak benar" bagi pengguna dalam radius 300 m.
- Satu pengguna hanya bisa memberi satu suara per laporan dan tidak bisa memvalidasi laporannya sendiri.
- Jumlah konfirmasi dan bantahan tampil di laporan.

### US-07 Membagikan SPBU
- Tombol "Bagikan" menghasilkan tautan `/spbu/{slug}` dengan pratinjau (Open Graph) berisi nama SPBU dan status terkini.

### US-08 Membaca pengumuman
- Admin bisa menayangkan banner pengumuman dengan masa tayang dan cakupan wilayah (seluruh Bali atau kabupaten tertentu).
- Pengguna bisa menutup banner, dan banner yang sudah ditutup tidak muncul lagi di perangkat tersebut.

### US-09 Moderasi (admin)
- Admin melihat antrean laporan yang banyak dibantah atau ditandai sistem.
- Admin bisa menyembunyikan laporan (status langsung dihitung ulang), memblokir pelapor, mengubah data SPBU, dan menonaktifkan SPBU.
- Semua tindakan admin tercatat di log audit.

### US-10 Terdekat yang ada BBM
Sebagai pengendara yang BBM-nya hampir habis, saya ingin satu tombol yang langsung menunjukkan SPBU terdekat yang ada BBM.

- Tombol utama di dock bawah peta.
- Mencari SPBU berstatus Tersedia (untuk jenis BBM yang sedang dipilih) dengan jarak lurus terdekat. Jika tidak ada dalam 15 km, memilih yang berstatus Terbatas dan memberi tahu pengguna.
- Peta terbang ke SPBU tersebut, detail terbuka, tombol "Arahkan" disorot.
- Jika lokasi belum diizinkan, tombol meminta izin lokasi terlebih dahulu.

### US-11 Halaman data publik
Sebagai warga, jurnalis, atau pemerintah daerah, saya ingin melihat data agregat agar bisa memahami skala krisis dan menilai keandalan layanan ini.

- Halaman `/data` dapat diakses dari kartu atas peta dan footer.
- Menampilkan: pengunjung unik, laporan diterima beserta jumlah pelapornya, jumlah SPBU dengan laporan segar sekarang, persentase ketersediaan layanan.
- Grafik laporan per jam (Ada, Terbatas, Habis) untuk 48 jam terakhir, dengan opsi "Tampilkan sebagai tabel".
- Kondisi sekarang per kabupaten/kota.
- Catatan gangguan layanan (waktu, jenis, penjelasan) yang diisi admin.
- Jumlah laporan yang ditolak sistem per alasan, sebagai transparansi perlindungan spam.
- Penjelasan metodologi status dan privasi.
- Laporan spam yang dikarantina tidak dihitung dalam grafik.
- Semua waktu dalam WITA. Data diperbarui paling lambat setiap 60 detik.

### US-12 Estimasi waktu antre (P1)
- Di detail SPBU tampil "Perkiraan waktu antre: sekitar X sampai Y menit" jika ada minimal 3 data waktu antre dalam 60 menit terakhir.
- Data berasal dari jawaban "Berapa lama Anda antre?" di form laporan (MVP) dan dari mode "Saya di antrean ini" (P1).
- Jika data kurang, tampil "Belum cukup data waktu antre".

### US-13 Kabar antrean (P1)
- Hanya pengguna dalam radius 300 m yang bisa menulis kabar.
- Maksimal 1 kabar per 5 menit per perangkat, 100 karakter, tanpa tautan dan nomor telepon.
- Pengguna lain bisa melaporkan kabar yang tidak pantas, kabar dengan 3 laporan disembunyikan otomatis.

### US-14 Menambahkan pengecer (P1)
- Pengguna menandai titik di peta dan memilih jenis (Pertashop atau pengecer).
- Tambahan baru tampil sebagai "Belum diverifikasi" hanya bagi penambahnya sampai lolos pemeriksaan: tidak di laut, tidak terlalu dekat dengan titik lain, perangkat tidak sedang menambah dalam jumlah tak wajar. Sisanya masuk antrean moderasi.

## 8. Logika status

Ini inti produk. Parameter di bawah disimpan di tabel `app_settings` sehingga bisa disetel tanpa deploy ulang.

| Parameter | Nilai awal | Arti |
|---|---|---|
| `status_window_min` | 120 | Hanya laporan dalam 120 menit terakhir yang dihitung |
| `decay_tau_min` | 60 | Konstanta peluruhan, laporan berumur 60 menit bobotnya sekitar 37% dari laporan baru |
| `min_weight` | 0,2 | Jika total bobot di bawah ini, status menjadi "Belum ada laporan" |
| `geofence_m` | 300 | Jarak maksimal pelapor ke SPBU |
| `max_accuracy_m` | 100 | Akurasi GPS terburuk yang diterima |
| `station_cooldown_min` | 30 | Satu perangkat hanya boleh melapor 1 kali per SPBU dalam 30 menit |
| `hourly_report_limit` | 6 | Maksimal laporan per perangkat per jam |
| `queue_window_min` | 60 | Tingkat antrean diambil dari laporan terbaru dalam 60 menit |

### Perhitungan per jenis BBM

Untuk setiap SPBU dan jenis BBM, setiap laporan dalam jendela waktu diberi bobot:

```
bobot = skor_kepercayaan_pelapor
      × exp(-umur_menit / decay_tau_min)
      × faktor_validasi

faktor_validasi = batas(1 + 0,3 × konfirmasi - 0,5 × bantahan, 0, 2)
```

Bobot dijumlahkan per nilai (Ada, Terbatas, Habis). Nilai dengan bobot terbesar menjadi status. Jika seri, yang laporannya paling baru menang. `confidence` = bobot nilai pemenang dibagi total bobot.

Jika total bobot di bawah `min_weight`, status menjadi **Belum ada laporan**. Pada Level 1, semua pelapor punya skor kepercayaan 1,0, sehingga satu laporan baru (bobot sekitar 1,0) cukup untuk menampilkan status, dan satu laporan tunggal akan memudar menjadi "Belum ada laporan" setelah sekitar 97 menit (karena exp(-97/60) ≈ 0,2). Beberapa laporan yang saling menguatkan bisa bertahan sampai batas jendela 120 menit.

Contoh: pukul 10.00 ada laporan "Ada", pukul 10.40 ada laporan "Habis". Pada pukul 10.45 bobot "Ada" ≈ exp(-45/60) = 0,47, bobot "Habis" ≈ exp(-5/60) = 0,92. Status menjadi Habis dengan confidence 0,66. Laporan baru otomatis mengalahkan laporan lama, tetapi beberapa laporan lama yang saling menguatkan masih bisa menahan satu laporan baru yang menyimpang.

### Status keseluruhan SPBU

| Kondisi | Status keseluruhan |
|---|---|
| Minimal satu jenis BBM berstatus Ada | **Tersedia** |
| Tidak ada yang Ada, minimal satu Terbatas | **Terbatas** |
| Semua jenis BBM yang punya status bernilai Habis | **Habis** |
| Semua jenis BBM Belum ada laporan | **Belum ada laporan** |

### Kesegaran

| Umur laporan terbaru | Tampilan |
|---|---|
| 0 sampai 30 menit | Normal, label "Baru" |
| 31 sampai 90 menit | Normal, waktu ditonjolkan |
| 91 sampai 120 menit | Pudar, label "Mungkin sudah berubah" |
| Lebih dari 120 menit | Belum ada laporan |

Peluruhan dijalankan ulang setiap 5 menit oleh job terjadwal, sehingga SPBU tanpa laporan baru akan memudar walau tidak ada aktivitas.

## 9. Aturan anti-penyalahgunaan (Level 1)

1. **Sesi anonim dengan CAPTCHA tak terlihat**: setiap perangkat mendapat identitas anonim (Supabase Anonymous Sign-In) yang dibuat setelah lolos Cloudflare Turnstile. Tidak ada login yang perlu diisi warga.
2. **Geofence**: laporan dan suara hanya diterima jika titik GPS berada maksimal 300 m dari SPBU, dengan akurasi maksimal 100 m. Diperiksa di server (PostGIS), bukan hanya di browser.
3. **Batas frekuensi**: 1 laporan per SPBU per 30 menit dan 6 laporan per jam per perangkat, plus batas pembuatan sesi anonim per IP.
4. **Validasi silang**: konfirmasi dan bantahan dari warga lain memengaruhi bobot laporan.
5. **Peluruhan waktu**: laporan palsu kehilangan pengaruh dengan sendirinya dalam waktu kurang dari satu jam.
6. **Moderasi**: laporan dengan 3 bantahan atau lebih dan tanpa konfirmasi masuk antrean moderasi. Admin dapat menyembunyikan laporan dan memblokir perangkat.
7. **Pencatatan**: setiap penolakan (di luar radius, terlalu sering, dan seterusnya) dicatat di `abuse_events` untuk mendeteksi pola serangan.

Risiko yang diterima di Level 1: pemalsuan lokasi GPS tidak bisa dideteksi sepenuhnya dari browser. Mitigasinya adalah kombinasi batas frekuensi, validasi silang, peluruhan, dan moderasi.

## 10. Kebutuhan non-fungsional

| Area | Target |
|---|---|
| Performa | LCP < 2,5 detik pada 4G menengah, ukuran JS awal < 200 KB (gzip) di luar library peta |
| Ketahanan beban | Jalur baca dilayani snapshot yang di-cache di edge, database tidak dibebani langsung oleh setiap pengunjung |
| Realtime | Perubahan status sampai ke pengguna lain dalam < 5 detik, fallback polling 60 detik |
| Offline | Snapshot terakhir dan app shell tersedia offline, dengan banner "Data terakhir diperbarui pukul ..." |
| Aksesibilitas | WCAG 2.1 AA, status tidak hanya dibedakan warna, target sentuh minimal 44 px |
| Perangkat | Berjalan baik di Android kelas menengah ke bawah dan browser bawaan (Chrome, Samsung Internet) |
| Zona waktu | Semua waktu disimpan sebagai `timestamptz`, ditampilkan dalam WITA (Asia/Makassar) |
| Privasi | Tanpa data pribadi wajib. Lokasi pelapor dibulatkan ke 4 desimal (sekitar 11 m), tidak pernah ditampilkan publik, dihapus setelah 30 hari |
| Keamanan | Semua tulis lewat fungsi database dengan validasi server, Row Level Security aktif di semua tabel |
| Ketersediaan | Target 99,5% selama masa krisis, dengan mode baca-saja darurat |

## 11. Metrik keberhasilan

| Metrik | Target 2 minggu pertama |
|---|---|
| Pengunjung harian | Dipantau sebagai indikator jangkauan, tanpa target kaku |
| Laporan per hari | > 500 |
| Persentase SPBU aktif yang punya status (bukan "Belum ada laporan") pada jam 07.00 sampai 21.00 | > 40% |
| Median umur laporan terbaru pada SPBU yang punya status | < 30 menit |
| Rasio laporan yang dibantah | < 10% |
| Waktu dari membuka situs ke menekan "Arahkan" (median) | < 30 detik |
| Waktu menyelesaikan laporan (median) | < 15 detik |
| Ketersediaan layanan | > 99,5% |

## 12. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Laporan palsu atau iseng | Warga diarahkan ke SPBU yang salah | Geofence, batas frekuensi, validasi silang, peluruhan, moderasi |
| Memicu panic buying | Memperparah kelangkaan | Bahasa tenang, tidak ada kata seperti "KOSONG!!", tidak ada notifikasi massal, selalu tampilkan waktu dan label "laporan warga", tautan ke imbauan resmi |
| Data SPBU awal tidak akurat | Penanda salah tempat atau SPBU hilang | Data awal dari OpenStreetMap diverifikasi manual, fitur usulan koreksi (P1) |
| Lonjakan trafik | Situs lambat atau mati | Snapshot ter-cache di edge, realtime dengan fallback polling, mode baca-saja |
| Partisipasi pelapor rendah | Banyak SPBU "Belum ada laporan" | Ajakan kontekstual saat pengguna di dekat SPBU, form sangat singkat, kolaborasi dengan komunitas ojol dan banjar |
| Kesan sebagai aplikasi resmi | Masalah hukum dan kepercayaan | Nama dan tampilan independen, tidak memakai logo merek, penafian "bukan aplikasi resmi" di footer dan halaman Tentang |
| Batas layanan peta gratis | Peta tidak termuat | Tile dari OpenFreeMap dengan cadangan file PMTiles Bali yang di-host sendiri |
| Krisis selesai, situs ditinggalkan | Biaya tanpa manfaat | Biaya operasional rendah, bisa diaktifkan kembali saat krisis berikutnya |
| Serangan skrip massal (laporan dan tempat palsu dalam jumlah ribuan) | Peta rusak, database kewalahan | Turnstile saat membuat sesi, batas per IP, karantina otomatis untuk lonjakan dari satu perangkat atau IP, tempat baru tidak langsung publik |
| Paket gratis hosting atau database dihentikan karena trafik | Situs mati untuk pengunjung baru | Mulai di paket berbayar sejak rilis, snapshot statis cadangan di penyimpanan terpisah (lihat `ARCHITECTURE.md`) |

### Pelajaran dari proyek serupa

Halaman data publik proyek komunitas sejenis yang berjalan di Bali pada krisis ini mencatat tiga gangguan dalam 35 jam pertama: serangan skrip yang mengirim sekitar 10 ribu laporan dan hampir 10 ribu tempat palsu, database gratis yang kewalahan karena gabungan spam dan trafik sehingga laporan langsung sempat dihentikan, serta akun hosting gratis yang dijeda karena trafik melampaui batas. Ketiganya diantisipasi sejak awal di dokumen ini: perlindungan spam berlapis, jalur baca lewat cache CDN, dan paket berbayar sejak hari pertama.

## 13. Rencana rilis

| Hari | Kegiatan |
|---|---|
| H1 | Setup monorepo, Supabase (region Singapura), skema dan migrasi, impor dan pembersihan data SPBU dari OpenStreetMap |
| H2 | Fungsi `submit_report`, `cast_vote`, `recompute_station_status`, job peluruhan, tes pgTAP |
| H3 | Peta, penanda, bottom sheet, daftar, filter |
| H4 | Detail SPBU, tombol arahkan, form laporan dengan geofence, realtime |
| H5 | PWA, panel admin dasar, pengumuman, halaman `/data`, halaman Tentang dan penafian |
| H6 | Uji lapangan di 5 sampai 10 SPBU di Denpasar dan Badung, perbaikan, uji beban |
| H7 | Rilis publik, sebar lewat komunitas, pemantauan intensif |

## 14. Pertanyaan terbuka

1. Siapa pengelola dan admin harian, dan siapa kontak darurat jika situs diserang spam?
2. Apakah ada mitra (pemerintah provinsi, komunitas ojol, banjar, media lokal) yang bisa membantu menyebarkan dan memverifikasi data SPBU?
3. Apakah BBM merek non-Pertamina perlu ditampilkan sejak MVP, atau fokus ke Pertamina dulu?
4. Domain apa yang akan dipakai?
5. Apakah pengumuman resmi (misalnya jadwal kapal BBM) akan diambil manual oleh admin atau ada sumber resmi yang bisa dirujuk?
