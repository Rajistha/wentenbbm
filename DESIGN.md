# DESIGN.md: Wenten BBM

Sumber acuan visual dan interaksi untuk `apps/web`, termasuk halaman admin (`/admin`). Token diimplementasikan di `packages/ui/tokens.css`, gaya komponen di `apps/web/app/globals.css`. Dokumen ini sudah diselaraskan dengan implementasi per 16 Oktober 2026; perubahan besar dari rancangan awal dicatat di bagian 16.

---

## 1. Prinsip desain

1. **Satu jawaban dalam satu lirikan.** Dari layar utama, pengguna langsung tahu SPBU mana yang ada BBM, seberapa jauh, dan seberapa baru kabarnya.
2. **Waktu selalu terlihat.** Setiap status disertai umur laporannya. Status tanpa waktu dianggap bug.
3. **Status tidak bergantung pada warna.** Setiap status punya warna, bentuk simbol, dan label teks, sehingga terbaca oleh pengguna buta warna dan di bawah terik matahari.
4. **Ibu jari dulu.** Aksi utama ada di separuh bawah layar dan terjangkau satu tangan, karena banyak pengguna membuka situs di atas motor. Melapor harus berupa ketukan, bukan mengetik.
5. **Cerah dan jelas.** Peta dan antarmuka berwarna terang dengan status berwarna lazim (hijau, kuning, merah). Warna dipakai untuk kecepatan baca; simbol dan label tetap membedakan.
6. **Jujur soal sumber.** Label "Laporan warga, bukan data resmi" selalu ada di detail SPBU. Angka tidak pernah dibuat-buat: bila datanya kosong, tampilan berubah menjadi ajakan melapor, bukan menampilkan nol besar.
7. **Tidak mengganggu.** Tidak ada animasi berkedip, tidak ada huruf kapital berteriak. Penanda berubah dengan transisi halus.

## 2. Warna

Satu tema terang. Tidak ada mode gelap dan tidak ada pengalih tema (dihapus agar peta dan penanda konsisten di semua perangkat).

## 3. Sistem status dan penanda peta

| Status | Penanda SPBU (lingkaran, ikon pompa putih) | Label | Teks pendek |
|---|---|---|---|
| Tersedia | Lingkaran hijau, garis putih 2 px | Tersedia | Ada |
| Terbatas | Lingkaran kuning, lencana setengah terisi di sudut | Terbatas | Terbatas |
| Habis | Lingkaran merah, lencana silang di sudut | Habis | Habis |
| Belum ada laporan | Cincin abu-abu putus-putus, pompa abu-abu, isi putih | Belum ada laporan | ? |

Jenis tempat dibedakan dari **bentuk**, status dari warna dan lencana:

| Jenis | Bentuk | Catatan |
|---|---|---|
| SPBU | Lingkaran | |
| Pertashop dan pengecer (Pertamini) | Kotak membulat berisi ikon pompa | Bisa dimatikan lewat panel Lapisan |
| Terminal BBM (TBBM) | Belah ketupat gelap berisi tangki, dengan label nama | Referensi, tidak bisa dilapori |
| Dikonfirmasi warga | Cincin luar kedua `--confirm-ring` 2 px | Minimal 2 pelapor berbeda sepakat dalam 30 menit |
| Lokasi pengguna | Titik biru dengan halo akurasi | |

Aturan:

- **Tanpa klaster.** Semua titik ditampilkan satu per satu (klaster berangka membingungkan warga dan dihapus). Ratusan titik tetap ringan karena penanda adalah ikon SVG lewat `map.addImage` dan symbol layer, bukan elemen DOM.
- **Kesegaran**: laporan berumur 91 sampai 120 menit membuat penanda memudar (opasitas 55%) dan labelnya berbunyi "Mungkin sudah berubah"; lewat itu status kembali ke Belum ada laporan.
- **Urutan tumpukan**: Tersedia di atas, lalu Terbatas, Habis, Belum ada laporan.
- Ukuran penanda 32 px (digambar 2x), area sentuh 44 px; SPBU terpilih diperbesar.
- Titik "Langsung" di kartu identitas berdenyut pelan; cincin denyut diberi ruang agar tidak terpotong, dan animasi dimatikan saat `prefers-reduced-motion`.

## 4. Tipografi

Huruf **Plus Jakarta Sans** (Google Fonts), cadangan `system-ui`. Angka memakai `tabular-nums` untuk jarak, waktu, dan statistik agar tidak bergoyang.

| Token | Ukuran / tinggi baris | Bobot | Kegunaan |
|---|---|---|---|
| `display` | 24 / 32 (judul halaman Tentang 28+) | 700 | Judul halaman |
| `title` | 20 / 28 | 700 | Nama SPBU di detail |
| `heading` | 17 / 24 | 600 | Judul bagian, nama di daftar |
| `body` | 16 / 24 | 400 | Teks utama. **Kolom isian selalu 16 px** supaya Safari iOS tidak memperbesar layar saat diketuk |
| `label` | 14 / 20 | 600 | Chip, tombol |
| `caption` | 13 / 18 (12 untuk keterangan kecil) | 400 | Waktu, jarak, keterangan |

## 5. Spasi, sudut, bayangan

- Skala spasi 4 px: 4, 8, 12, 16, 20, 24, 32, 48. Gutter samping 16 px di HP, 24 px di desktop.
- Radius: `--r-sm 8px` (chip kecil, kolom isian), `--r-md 12px` (kartu, tombol), `--r-lg 20px` (sudut atas bottom sheet, kartu besar), `--r-full` (FAB, penanda).
- Dua tingkat bayangan: `--shadow-1` untuk kartu di atas peta, `--shadow-2` untuk bottom sheet.
- Gerak (durasi, kurva, reduced motion) ada di bagian 10.

## 6. Ikon dan logo

- **Ikon**: garis monokrom dari **lucide-react** lewat satu komponen `Icon` (`strokeWidth 2`, mengikuti warna teks). Tanpa emoji. Ikon dekoratif `aria-hidden`; tombol yang hanya berisi ikon wajib punya `aria-label`.
- Ikon merek tidak ada di lucide, jadi **logo Instagram** digambar sendiri (`InstagramIcon`, SVG garis).
- **Logo**: tetesan BBM putih dengan titik lokasi di dalamnya, di kotak biru membulat bergradasi (`#3b82f6` ke `#1d4ed8`), diikuti kata "Wenten **BBM**" (BBM berwarna biru, bobot lebih ringan). Dipakai di kartu identitas, halaman Tentang, login admin, poster, dan gambar bagikan.
- Tagline: "Wenten BBM - semeton bantu semeton cek BBM Bali".

## 7. Tata letak dan komponen

### 7.1 Konsep: peta penuh layar dengan kontrol mengambang

Peta mengisi 100% layar. Semua kontrol adalah **kartu mengambang** (`.float-card`): latar `--surface-glass`, radius `--r-md`, `--shadow-1`. Panel yang lebih besar (daftar, detail, lapor) adalah **bottom sheet** di HP dan **laci kanan** 400 px di desktop, sehingga peta tetap terlihat.

### 7.2 Layar utama di HP (360 sampai 430 px)

```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │
│ │ [logo] Wenten BBM ● Langsung ⓘ│ │  Kartu identitas
│ │ 135 online · 0 laporan · 135 pengunjung │  Baris angka (lihat 7.9)
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ⌕ Cari SPBU, Pertamini, atau tempat │  Bilah cari
│ └─────────────────────────────┘ │
│ [Semua][Pertalite][Pertamax][Solar]…  Tab jenis BBM, geser horizontal
│ ┌─ kartu antre (bila mengantre) ┐│  Lihat 7.7
│                                 │
│          PETA PENUH             │
│   (semua titik, tanpa klaster)  │
│                            [◎]  │  Lokasi saya
│ ┌─────────────────────────────┐ │
│ │ Belum ada laporan hari ini  │ │  Strip status / keadaan kosong
│ │ [Lihat SPBU terdekat]       │ │
│ └─────────────────────────────┘ │
│ [◎ Terdekat yang ada BBM][Daftar]│  Dock: aksi utama + Daftar
│  [Lapisan] [Tambah] [Bagikan]   │  Aksi sekunder
└─────────────────────────────────┘
```

- Tombol `ⓘ` membuka menu: bantuan, legenda, data (`/data`), tentang, bahasa ID/EN, serta pintasan Lapisan, Tambah, Bagikan di HP.
- **Bilah cari** bergaya Google Maps: mengenali nama SPBU, nomor SPBU, jalan, kecamatan, tempat, dan alias populer ("gatsu", "SPBU dekat Kuta"), toleran salah ketik. Kolom isian 16 px.
- **Strip status**: bar proporsi tersegmen dan angka per status, sekaligus filter cepat. Bila belum ada satu pun laporan, strip berubah menjadi ajakan "Belum ada laporan hari ini" dengan tombol, bukan deretan nol.
- Saat sheet terbuka di HP, dock dan kartu kontrol disembunyikan.
- Zoom memakai cubit; tombol `+` `−` hanya di desktop.

### 7.3 Layar utama desktop (≥ 1024 px)

Kartu identitas di kiri atas (logo, status langsung, waktu pembaruan, baris angka, tautan "Lihat data"), kartu kontrol di kanan atas (tab jenis BBM, ID/EN, bantuan), strip status dan dock di tengah bawah, legenda di kiri bawah, zoom dan lokasi di kanan bawah. **Daftar** dan **detail** membuka laci kanan 400 px. Popup SPBU menempel pada penanda (360 px) dengan tombol "Buka detail". Tablet (640 sampai 1023 px) memakai layout HP dengan lebar maksimal 560 px.

### 7.4 Daftar SPBU

Bottom sheet dua titik henti (half 55%, full 92%), bisa digeser ke bawah untuk menutup dari gagang, header, maupun isi.

- **Header**: judul, jumlah, kolom cari, chip urutan (Terdekat, Laporan terbaru, Tersedia dulu), chip **Favorit** dan **Hanya yang tersedia**.
- **Kartu misi** (bila ada wilayah dengan ≥3 SPBU tanpa kabar segar): "Buleleng butuh laporan, 56 dari 56 SPBU belum ada kabar" dengan tombol Lihat.
- **Rekomendasi terbaik**: tiga SPBU teratas menurut jarak, antrean, dan kebaruan, lalu judul "Semua tempat". Hanya tampil saat tidak sedang mencari atau memfilter.
- **Kartu SPBU** (`.sc`):

```
┌─────────────────────────────────────────┐
│ [foto 76px]  SPBU Panjer                │
│              54.803.xx                  │
│              1,2 km · Jl. Raya Panjer   │
│              ◷ Buka · tutup 22.00       │  Jam buka (bila tercatat) / 24 jam
│              ⏱ 4 orang sedang antre     │  Pelacak antrean
│ ● Tersedia  ✓ Terkonfirmasi  ⛟ Antre sedang │  Pil status
│ Laporan terakhir 12 mnt lalu · 7 laporan dalam 3 jam terakhir │
│ [Pertalite · Ada] [Pertamax · Habis] …  │  Maks. 4 chip BBM
│ [✓ Ada] [✕ Habis] [↗] [⤴]               │  Aksi cepat
└─────────────────────────────────────────┘
```

  - Foto: dari Mapillary (foto jalan yang menghadap SPBU, dipilih otomatis) atau ikon pompa bila tidak ada.
  - Peringatan kuning "Baru 1 laporan, bisa meleset" muncul bila laporan 3 jam kurang dari 3.
  - SPBU tanpa laporan tetap tampil, setelah yang berstatus, dengan ajakan "Jadilah yang pertama melapor".
  - Tombol aksi cepat redup bila pengguna di luar radius (kecuali syarat radius dimatikan admin).

### 7.5 Detail SPBU

Bottom sheet half yang bisa ditarik ke full (HP), laci kanan (desktop).

```
┌─────────────────────────────────────────┐
│ ← SPBU Panjer                  ♡   ×    │  Favorit dan tutup
│   Pertamina · 54.803.xx                 │
│   ◷ Buka · tutup 22.00                  │
│   ⏱ 4 orang sedang antre                │
│   Jl. Raya Panjer · 1,2 km              │
│ [ foto banner ]                         │
│ ● Tersedia  ✓ Terkonfirmasi             │
│ ◷ Laporan terakhir 12 mnt lalu · 7 laporan dalam 3 jam │
│ Pertalite      ● Ada       12 mnt       │
│   Rp 10.000 · harga resmi               │  Harga warga, atau harga resmi sebagai acuan
│ Pertamax       ○ Habis     12 mnt       │
│ Antrean        ⛟⛟ Sedang                │
│ Perkiraan tunggu 15–30 menit            │
│ Lalu lintas depan SPBU: lancar          │  TomTom
│ [ ⏱ Saya di antrean ini ]               │
│ [ ↗ Arahkan             ] [⤴]           │
│ ┌ Bantu warga lain ────────────────────┐│
│ │ [✓ Ada BBM] [✕ Habis]   Terbatas?    ││
│ └──────────────────────────────────────┘│
│ [Isi harga] [Usulkan koreksi]           │
│ Laporan terbaru … [Masih benar] [Tidak benar] │
│ ⓘ Laporan warga, bukan data resmi.      │
└─────────────────────────────────────────┘
```

- **Arahkan** selalu aktif dan membuka Google Maps berbasis **nama SPBU** (supaya Google memilih tempat yang tepat, bukan hanya koordinat). Menu kecil: aplikasi peta lain dan salin koordinat.
- **Harga**: median laporan warga 7 hari terakhir; bila belum ada, **harga resmi Pertamina** ditampilkan redup dengan label "harga resmi" (hanya untuk SPBU dan Pertashop, tidak untuk Pertamini).
- **Isi harga** dan **Usulkan koreksi** membuka dialog kecil (lihat 7.7).
- Tombol lapor aktif hanya dalam radius lapor (bawaan 300 m, `geofence_m`; **semua angka radius di teks, pemeriksaan klien, dan panel admin mengikuti pengaturan itu**). Bila syarat radius dimatikan admin, batas jarak dan akurasi dilonggarkan tetapi **lokasi tetap wajib** dikirim. Di luar radius atau tanpa lokasi, ketukan menjelaskan alasannya.

### 7.6 Form lapor: wizard ketuk-ketuk

Satu pertanyaan per layar, pilihan besar, hampir semua langkah maju otomatis setelah satu ketukan. Selesai dalam 3 ketukan untuk kasus umum.

```
Langkah:  1 Ada atau tidak?  →  2 BBM apa? (jika ada)  →  3 Antrean?  →  4 Berapa lama? (opsional)
Header:   ← kembali   Langkah 2 dari 4   × tutup   (garis kemajuan)   📍 nama SPBU
Footer:   [Lewati] [Kirim]        Lewati = ke pertanyaan berikut, Kirim = kirim sekarang
```

- Pintasan dari detail (`Ada BBM` / `Habis`) melewati langkah 1.
- "Habis" melewati pemilihan BBM (semua jenis dianggap habis).
- Tombol **Lewati** dan **Kirim** selalu dua tombol berbeda dengan arti berbeda; Kirim aktif begitu ada jawaban.
- Setelah sukses: sheet tertutup, toast terima kasih, penanda SPBU beranimasi satu kali.
- Pesan galat inline di atas footer, bahasa sederhana, selalu dengan saran tindakan. Laporan offline masuk antrean dan dikirim saat daring.

### 7.7 Pelacak antrean, favorit, dan dialog kecil

**Pelacak antrean**
- Tombol "Saya di antrean ini" di detail (aktif dalam radius). Dialog kecil memilih jenis BBM lalu "Mulai ukur antrean".
- Selama mengantre, **kartu antre** (`.queue-bar`, garis kiri biru) tampil di bawah kartu identitas di semua layar: "Antre 12 menit · nama SPBU" dengan tiga tombol: **Dapat BBM** (utama), **Habis atau tutup**, **Pergi**.
- Hasil Dapat BBM atau Habis otomatis menjadi laporan; waktu tunggu masuk estimasi. Sesi tanpa denyut lokasi 20 menit berakhir sendiri.
- Di kartu dan detail muncul "N orang sedang antre"; di kartu identitas muncul kolom "antre" bila ada.

**Favorit**: ikon hati di header detail (maks. 12, tersimpan di perangkat) dan chip Favorit di daftar. Saat aplikasi dibuka dan status favorit berubah menjadi Tersedia atau Habis, muncul toast; tidak ada push saat aplikasi tertutup.

**Dialog kecil** (`.modal`, tengah layar, latar redup): dipakai untuk mulai antre, isi harga (kolom Rp per jenis BBM, 3.000 sampai 60.000), dan usulan koreksi (lokasi salah, sudah tutup, BBM tidak sesuai, data ganda, lainnya, plus catatan 280 huruf).

### 7.8 Komponen inti

| Komponen | Catatan |
|---|---|
| `IdentityCard`, `ControlCard`, `StatusStrip`, `ActionDock`, `MapFabs`, `MapLegend`, `LayerPanel` | Kontrol mengambang di atas peta |
| `SearchBar`, `SearchPanel` | Pencarian ala Google Maps |
| `StationMap` | MapLibre, symbol layer, tanpa klaster |
| `StationList`, `StationDetail`, `StationPopup`, `StationPhoto`, `TrafficRow`, `RecentReports` | Daftar dan detail |
| `StationNotes` (`OpeningNote`, `QueuingNote`, `ReportCountNote`) | Jam buka, antrean, jumlah laporan 3 jam dan peringatan |
| `ReportSheet` | Wizard lapor |
| `QueueBar`, `QueueJoin` | Pelacak antrean |
| `FavoriteButton` | Favorit |
| `StationActions` | Isi harga, usulan koreksi |
| `AddPlacePicker`, `AddPlaceSheet` | Tambah tempat |
| `BottomSheet` | Dua titik henti, gestur geser tutup, kunci fokus saat penuh |
| `Modal` | Dialog tengah layar |
| `ShareModal`, `SnapshotShare` | Bagikan SPBU (QR) dan bagikan ringkasan (gambar) |
| `StatusGlyph`, `QueueIndicator`, `RelativeTime` | Simbol status, titik antrean, waktu relatif (diperbarui tiap 30 detik, ketuk untuk jam WITA) |
| `Logo`, `LogoMark`, `Icon`, `InstagramIcon` | Identitas dan ikon |

### 7.9 Kartu identitas dan baris angka

Kartu kiri atas: logo, titik "Langsung" (hijau, berdenyut) dengan label, tombol info; di bawahnya **baris angka satu baris**: **N online · N laporan · N pengunjung**, dengan angka tebal `--text`, label abu-abu, dipisah titik tengah (spasi 8 px). Tampil di HP dan desktop. Kolom "antre" menyelip di antara online dan laporan bila ada yang mengantre.

- **online** = perangkat unik yang aktif 1 jam terakhir (tooltip menjelaskan). Dihitung dari denyut perangkat tiap 15 menit.
- **laporan** = total laporan aktif, selalu tampil termasuk 0.
- **pengunjung** = jumlah perangkat unik per hari, dijumlahkan sejak peluncuran.

### 7.10 Tambah Tempat

Warga menambah Pertamini atau Pertashop yang belum ada: tombol **Tambah** di dock, lalu alur dua langkah (geser penanda di peta, isi formulir: jenis, nama, BBM yang dijual). Tempat baru terlihat langsung oleh penambahnya dengan label "Menunggu verifikasi"; yang mencurigakan (jauh dari SPBU dikenal, melewati batas harian) masuk karantina untuk admin. Tempat yang sudah disetujui bertanda **Ditambahkan warga**.

## 8. Status layar khusus

| Situasi | Tampilan |
|---|---|
| Memuat pertama kali | Peta tampil lebih dulu; kartu atas dan strip berupa skeleton. Data dari cache perangkat langsung dipakai |
| Belum ada laporan | Strip berubah jadi ajakan melapor; baris angka tetap tampil (laporan = 0) |
| Izin lokasi ditolak | Peta di Denpasar, kartu penjelasan dengan tombol "Cari wilayah" |
| GPS tidak akurat | Pesan "Sinyal GPS kurang akurat, coba di area terbuka." |
| Offline | Banner: "Anda sedang offline. Menampilkan data pukul …" |
| Tidak ada SPBU tersedia terdekat | Pesan dengan saran memperluas area atau memeriksa lagi |
| Mode baca-saja (admin mematikan pelaporan) | Tombol lapor nonaktif, banner pemeliharaan |
| Galat server | "Gagal memuat data terbaru. Menampilkan data terakhir." |
| Angka belum tersedia dari server (migrasi belum dijalankan) | Bagian terkait disembunyikan, tidak menampilkan nol palsu |

## 9. Pedoman bahasa

- **Bahasa Indonesia adalah bawaan** saat situs dibuka; Inggris tersedia lewat pengalih ID/EN (nada sama, tanpa deteksi bahasa peramban).
- Kalimat pendek dan sehari-hari. Gunakan "Habis", bukan "KOSONG" atau tanda seru.
- "Dilaporkan" menandai sumber: "Dilaporkan tersedia 12 menit lalu".
- Hindari angka yang memancing panik; ringkasan dibingkai berguna ("8 SPBU tersedia dalam 5 km").
- Pesan galat selalu memberi arah tindakan.
- Waktu absolut 24 jam, zona WITA ("19.02 WITA"). Jarak: di bawah 1 km dalam meter dibulatkan 50 m, di atas itu satu desimal ("1,2 km"). Harga: "Rp 10.000".
- Nama proyek "Wenten BBM" ("wenten" = ada dalam bahasa Bali) dengan penafian bahwa situs ini bukan afiliasi Pertamina.

## 10. Gerak

- Durasi standar 200 ms, bottom sheet 280 ms, kurva `cubic-bezier(0.2, 0, 0, 1)` (token `--dur`, `--dur-sheet`, `--ease`).
- Perubahan status penanda lewat realtime: transisi halus 300 ms, tanpa kedip. Penanda yang baru dilapori beranimasi skala satu kali.
- Titik "Langsung" berdenyut pelan; cincin denyut diberi ruang agar tidak terpotong.
- Hormati `prefers-reduced-motion`: semua animasi diganti perubahan instan.

## 11. Aksesibilitas

- Kontras teks minimal 4,5:1, objek grafis minimal 3:1.
- Status selalu punya label teks dan `aria-label` pada penanda dan kartu, misalnya "SPBU Panjer, Tersedia, 1,2 km".
- Peta punya alternatif penuh lewat daftar, sehingga pengguna pembaca layar tidak perlu berinteraksi dengan peta.
- Fokus keyboard terlihat jelas (cincin 2 px `--focus`, jarak 2 px). Esc menutup sheet dan dialog.
- Bottom sheet dan dialog bisa dioperasikan dengan keyboard dan mengunci fokus saat posisi penuh.
- Toggle admin memakai `role="switch"` dengan `aria-checked`; tab memakai `aria-current`; filter memakai `role="tab"`.
- Kolom isian 16 px agar layar tidak diperbesar otomatis di iOS. Area sentuh minimal 44 px untuk aksi utama.
- Bahasa halaman diatur lewat `lang`; ikon dekoratif `aria-hidden="true"`.

## 12. Halaman data publik (`/data`)

### 12.1 Isi

Halaman transparansi dengan tema terang yang sama, lebar maksimal 1040 px. Isi: kartu statistik (pengunjung, laporan, SPBU dengan laporan segar, ketersediaan layanan), kondisi sekarang per wilayah (bar sama dengan strip status, bisa dipilih per jenis BBM), laporan per jam 48 jam terakhir, estimasi tunggu, ketersediaan layanan sejak rilis, catatan gangguan, perlindungan spam, dan penjelasan metodologi serta privasi.

### 12.2 Aturan visual

- Kartu statistik: angka 32/40 bobot 700 `tabular-nums`, label `caption` abu-abu; empat kolom di desktop, dua di HP.
- Grafik laporan per jam: bar bertumpuk memakai `--chart-available`, `--chart-limited`, `--chart-empty`; Habis diberi pola garis miring agar terbedakan saat dicetak hitam putih. Sumbu Y mulai dari 0.
- Lencana gangguan dibedakan simbol: `◆ SPAM`, `◐ SEBAGIAN`, `○ TIDAK BISA DIAKSES`, `◇ PEMELIHARAAN`.
- Setiap grafik punya tautan "Tampilkan sebagai tabel" dan ringkasan teks `aria-describedby`. Grafik digambar dengan **uPlot** di klien; angka kartu dirender di server.

## 13. Panel admin (`/admin`)

Bagian dari aplikasi yang sama (bukan aplikasi terpisah), memakai token yang sama, tidak diindeks. Teks hanya bahasa Indonesia.

**Masuk**: kartu di tengah layar di atas latar hijau-biru lembut. Isi: logo, judul "Masuk admin", keterangan, kolom email dan kata sandi (tinggi 46 px, huruf 16 px, tombol **Tampilkan** di dalam kolom sandi), kotak galat merah muda dengan ikon, tombol Masuk selebar kartu, dan catatan "Dilindungi captcha. Akses dicatat." Galat captcha menampilkan kode (mis. 110200 = domain belum terdaftar di widget Turnstile).

**Kerangka**: header lengket (logo, lencana "Admin", tombol Keluar); di bawahnya **tab bergulir** dengan garis biru pada tab aktif dan **lencana merah** jumlah yang perlu ditangani (Laporan, Tempat, Koreksi). Pemberitahuan hasil aksi tampil sebagai toast di bawah; aksi merusak meminta konfirmasi.

| Tab | Isi |
|---|---|
| **Ringkasan** | "Perlu perhatian" (kartu merah muda yang bisa diketuk menuju tabnya: laporan ditandai, dikarantina, tempat menunggu, koreksi menunggu), "Aktivitas" (laporan 24 jam, usulan warga, pelanggaran, perangkat diblokir), dan **Kontrol** berupa **toggle ON/OFF**: *Pelaporan warga* (OFF = mode baca-saja) dan *Syarat radius 300 m* (OFF = melapor dari mana saja) |
| **Laporan** | Filter (Ditandai warga, Dikarantina, Disembunyikan, 24 jam). Kartu per laporan: SPBU, lencana status laporan, chip BBM berwarna (Tersedia hijau, Terbatas kuning, Habis merah), antrean, catatan, info pelapor. Aksi: Sembunyikan atau Pulihkan, **Hapus laporan** (permanen), Blokir pelapor, **Hapus semua dari pelapor ini**. Tiap laporan menampilkan tombol kunci IP (hash harian, menyaring laporan dari IP yang sama) dan **Ambil koordinat pelapor**. Tombol tampilan **Daftar / Peta lokasi pelapor** membuka peta titik: biru aktif, kuning dikarantina, abu-abu disembunyikan, cincin untuk SPBU, garis putus-putus pelapor ke SPBU, ketuk titik untuk rincian. Akses koordinat tercatat di log audit |
| **Tempat** | Filter (Menunggu tinjauan, Semua usulan warga, Disembunyikan). Aksi: Setujui, Ubah nama, Tolak; tautan "Lihat di peta" |
| **Koreksi** | Kartu usulan dengan koordinat saat ini dan usulan (jarak geser). Setujui koreksi lokasi memindahkan titik; "sudah tutup" menyembunyikan tempat |
| **Pengumuman** | Formulir (judul, isi, tingkat, jam tayang, wilayah) dan riwayat dengan lencana Tayang atau Selesai |
| **Pengaturan** | Formulir **Harga resmi Pertamina** (tanggal berlaku dan harga per BBM) dan daftar pengaturan lanjutan (angka bisa diubah; nilai boolean berupa toggle) |

Aturan komponen admin: kartu `.adm-item` dengan kepala (nama dan lencana), baris meta kecil, dan barisan tombol di bawah; tombol berbahaya berwarna merah garis; lencana berwarna (hijau, kuning, merah, biru, abu-abu); keadaan kosong bergaris putus-putus; **toggle** `.adm-switch` 48×28 dengan tulisan ON (hijau) atau OFF (abu-abu) di sampingnya.

## 14. Bagikan

Semua tombol **Bagikan** membuka modal tiga tab (HP dan desktop) dengan kontrol segmen: **Cerita**, **Postingan**, **Pesan**. Ada dua versi, dengan tab dan tata letak yang sama.

**Bagikan umum** (dock di peta dan menu `ⓘ`): modal "Bagikan Wenten BBM".

| Tab | Gambar | Isi |
|---|---|---|
| **Cerita** | 1080×1920 | Logo, "KONDISI BBM DI BALI SAAT INI · jam WITA", judul besar **N dari 308 SPBU ada BBM** (angka hijau), peta titik, legenda, jumlah laporan 24 jam, batang per wilayah (4 teratas), pita gelap berisi alamat situs |
| **Postingan** | 1080×1080 | Logo dan alamat di atas, judul, peta besar, legenda |
| **Pesan** | 1200×630 | Pratinjau dua kolom dan teks siap kirim dengan angka terkini |

**Bagikan satu SPBU** (kartu daftar, detail, popup): modal "Bagikan SPBU" dengan nama SPBU di bawah judul. Gambarnya berisi nama dan alamat, status besar berwarna (Tersedia, Terbatas, Habis, atau Belum ada laporan), umur laporan terakhir dan jumlah laporan 3 jam, antrean, daftar BBM per jenis dengan status, serta peta Bali dengan SPBU itu disorot (halo biru dan cincin gelap, titik lain dikecilkan). Pita bawah berisi alamat halaman SPBU. Di bawah tombol bagikan ada tombol **"Kode QR dan poster"** yang membuka tampilan kedua (kode QR, salin tautan, WhatsApp, bagikan lewat aplikasi, unduh QR, poster cetak) dengan tombol "Bagikan sebagai gambar" untuk kembali.

Aturan umum:
- Latar `#f7f5f0`; peta digambar sebagai titik berwarna status di atas gumpalan abu-abu lembut yang membentuk pulau. Gambar dibuat server (`/api/share/image`, parameter `f`, `lang`, `spbu`; disimpan 5 menit) dari data terkini, dalam bahasa yang dipilih.
- Bila belum ada laporan, judul umum menjadi "Belum ada laporan hari ini" dengan ajakan melapor; tidak pernah menampilkan "0 dari 308".
- Gambar diunduh ke memori saat tab dibuka (pratinjau memakai gambar yang sama), sehingga tombol utama ("Bagikan cerita", "Bagikan postingan", "Bagikan pesan") membuka menu bagikan perangkat (Instagram, WhatsApp, aplikasi lain) dengan gambar terlampir dalam ketukan yang sama. Tombol nonaktif ("Menyiapkan…") sampai gambar siap.
- Perangkat tanpa menu bagikan berkas: gambar diunduh, dan tab Pesan membuka WhatsApp dengan teks dan tautan. Tab Pesan juga punya "Salin teks dan tautan".

## 15. Halaman lain

- **Tentang** (`/tentang`): hero dengan tagline dan satu paragraf pengantar, tiga kartu "Cara kerja", kotak keselamatan, kartu Privasi dan Penafian, chip wilayah, tautan **Cetak poster QR** dan **Data dan statistik**, lalu kartu **"Ikuti kami di Instagram"** (ikon Instagram bergradasi, tombol biru `@wentenbbm`), dan kredit data (OpenStreetMap ODbL, Esri, Mapillary).
- **Poster** (`/poster`, `/poster?spbu=slug`): kartu A4 siap cetak berisi logo, judul, kode QR besar, alamat, tiga langkah, dan tagline. Bagian alat (tombol Cetak) disembunyikan saat dicetak. Tidak diindeks mesin pencari.
- **Halaman SPBU** (`/spbu/[slug]`) dan **wilayah** (`/wilayah/[slug]`): halaman statis yang ramah mesin pencari, dengan data terstruktur dan gambar OG per SPBU. Isi mengikuti detail, dengan tautan kembali ke peta.
- **Data** (`/data`): lihat bagian 12.

## 16. Perubahan dari rancangan awal

| Aspek | Rancangan awal | Sekarang |
|---|---|---|
| Palet | Monokromatik teal, status dibedakan gelap terang | Cerah: hijau, kuning, merah, aksen biru; simbol dan label tetap ada |
| Tema | Terang dan gelap | Terang saja |
| Basemap | Positron (abu-abu minim) | Esri World Topo (berwarna) |
| Penanda | Simbol Unicode, klaster berangka | Ikon pompa SVG dalam lingkaran, semua titik tanpa klaster |
| Ikon | Unicode monokrom | lucide-react garis |
| Form lapor | Daftar segmen semua BBM dalam satu layar | Wizard satu pertanyaan per layar |
| Pelacak antrean | Mode lengkap dengan kabar antrean dan chat | Pelacak waktu (mulai, hasil, estimasi); chat antrean belum dibuat |
| Daftar | Item teks | Kartu bergambar dengan aksi cepat, rekomendasi, misi, favorit |
| Bahasa bawaan | Mengikuti peramban | Indonesia |
| Bagikan | Tautan dan QR | QR per SPBU; gambar ringkasan (cerita, postingan, pesan) untuk bagikan umum |
| Admin | Aplikasi terpisah `apps/admin`, tabel padat | Halaman `/admin` di aplikasi yang sama, tab dan kartu, toggle |
| Halaman baru | n/a | Poster QR, Tentang yang didesain ulang, halaman SPBU dan wilayah untuk SEO |
