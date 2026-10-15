# DESIGN.md: Wenten BBM

Dokumen ini adalah sumber acuan visual dan interaksi untuk `apps/web` dan `apps/admin`. Token di sini diimplementasikan di `packages/ui/tokens.css` dan preset Tailwind di `packages/config/tailwind`.

---

## 1. Prinsip desain

1. **Tenang, bukan alarm.** Ini alat bantu saat krisis. Tampilan harus menenangkan dan informatif, bukan memicu panik. Tidak ada merah menyala, tidak ada huruf kapital berteriak, tidak ada animasi berkedip.
2. **Satu jawaban dalam satu lirikan.** Dari layar utama, pengguna harus langsung tahu SPBU terdekat mana yang ada BBM, seberapa jauh, dan seberapa baru informasinya.
3. **Waktu selalu terlihat.** Setiap status selalu disertai umur laporannya. Status tanpa waktu dianggap bug.
4. **Status tidak bergantung pada warna.** Setiap status punya bentuk simbol dan label teks sendiri, sehingga tetap terbaca oleh pengguna buta warna, di bawah terik matahari, atau di layar murah.
5. **Ibu jari dulu.** Semua aksi utama berada di separuh bawah layar dan bisa dijangkau satu tangan, karena banyak pengguna membuka situs sambil duduk di atas motor.
6. **Jujur soal sumber.** Label "Laporan warga, bukan data resmi" selalu ada di detail SPBU.

## 2. Warna

Skema **monokromatik teal** dengan netral yang sedikit diwarnai teal. Status dibedakan lewat tingkat gelap terang, bentuk, dan label, bukan lewat warna yang berlawanan (hijau, kuning, merah).

### 2.1 Palet dasar

| Token | Hex | Kegunaan |
|---|---|---|
| `--teal-50` | `#EEF7F6` | Latar bagian terpilih, latar chip aktif ringan |
| `--teal-100` | `#D4ECE9` | Latar banner, hover |
| `--teal-200` | `#A9D8D3` | Garis fokus sekunder, isian "Terbatas" mode gelap |
| `--teal-300` | `#74BDB5` | Ikon sekunder mode gelap |
| `--teal-400` | `#439F96` | Isian penanda "Terbatas" |
| `--teal-500` | `#23827A` | Aksen, cincin fokus |
| `--teal-600` | `#176861` | Isian penanda "Tersedia", tombol utama |
| `--teal-700` | `#12524D` | Teks aksen di atas latar terang |
| `--teal-800` | `#0E3F3B` | Teks judul, penanda "Habis" |
| `--teal-900` | `#0A2D2A` | Teks utama |
| `--ink-0` | `#FFFFFF` | Permukaan |
| `--ink-50` | `#F5F8F8` | Latar halaman |
| `--ink-100` | `#E6ECEB` | Garis pemisah |
| `--ink-300` | `#B4C0BE` | Garis putus "Belum ada laporan" |
| `--ink-500` | `#6B7B79` | Teks sekunder |
| `--ink-700` | `#3A4847` | Teks badan alternatif |

Teks badan memakai `--teal-900` di atas `--ink-0` (kontras sekitar 14:1). Teks sekunder `--ink-500` di atas putih memenuhi AA untuk teks 16 px. `--teal-400` hanya untuk objek grafis (kontras di atas 3:1), tidak untuk teks.

### 2.2 Token semantik

```css
:root {
  --bg: var(--ink-50);
  --surface: var(--ink-0);
  --surface-raised: var(--ink-0);
  --border: var(--ink-100);
  --text: var(--teal-900);
  --text-muted: var(--ink-500);
  --accent: var(--teal-600);
  --accent-text: var(--ink-0);
  --focus: var(--teal-500);

  --status-available: var(--teal-600);
  --status-limited: var(--teal-400);
  --status-empty: var(--teal-800);
  --status-unknown: var(--ink-300);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #071D1B;
    --surface: #0C2724;
    --surface-raised: #11322E;
    --border: #1B4540;
    --text: #E4F1EF;
    --text-muted: #9FB5B2;
    --accent: var(--teal-300);
    --accent-text: #071D1B;
    --focus: var(--teal-200);

    --status-available: var(--teal-300);
    --status-limited: var(--teal-200);
    --status-empty: #E4F1EF;
    --status-unknown: #4E6563;
  }
}
:root[data-theme="dark"] { /* nilai sama dengan blok di atas */ }
```

### 2.3 Peta

Gaya dasar peta memakai **Positron** dari OpenFreeMap (abu-abu terang, minim warna) agar penanda status menonjol. Mode gelap memakai varian gelap dengan penyesuaian warna air dan jalan ke rentang teal gelap. Label jalan tetap tampil karena dibutuhkan untuk orientasi.

## 3. Sistem status

| Status | Simbol | Penanda peta | Label | Teks pendek (chip) |
|---|---|---|---|---|
| Tersedia | `●` | Lingkaran penuh `--status-available`, garis putih 2 px | Tersedia | Ada |
| Terbatas | `◐` | Lingkaran setengah terisi `--status-limited`, garis `--status-available` | Terbatas, antre | Terbatas |
| Habis | `○` | Cincin `--status-empty` 3 px dengan `×` di tengah, isi putih | Habis | Habis |
| Belum ada laporan | `◌` | Cincin putus-putus `--status-unknown`, isi putih | Belum ada laporan | ? |

Penanda tambahan:

| Jenis | Penanda | Catatan |
|---|---|---|
| Dikonfirmasi warga | Cincin luar kedua `--teal-900` 2 px mengelilingi penanda status | Minimal 2 pelapor berbeda sepakat dalam 30 menit |
| Pengecer (P1) | Persegi kecil 12 px `■` dengan warna status, tanpa cincin | Bisa dimatikan lewat tombol lapisan |
| Pengecer belum diverifikasi (P1) | Persegi kosong `□` putus-putus | Hanya terlihat oleh penambahnya |
| Terminal BBM / TBBM (P1) | Belah ketupat `◆` `--ink-700` dengan label nama | Referensi, tidak bisa diketuk untuk melapor |
| Lokasi pengguna | Titik `--teal-500` dengan halo akurasi transparan | |

Aturan tambahan:

- **Kesegaran**: jika laporan terbaru berumur 91 sampai 120 menit, penanda dan chip memakai opasitas 55% dan label waktu berbunyi "Mungkin sudah berubah".
- **Ukuran penanda**: 24 px di zoom kota, 32 px saat terpilih, area sentuh 44 px.
- **Urutan tumpukan**: Tersedia di atas, lalu Terbatas, Habis, Belum ada laporan, agar SPBU yang berguna tidak tertutup.
- **Klaster**: di zoom di bawah 11, penanda dikelompokkan. Klaster menampilkan jumlah SPBU dan cincin tipis yang proporsinya menunjukkan berapa yang Tersedia.
- Penanda digambar sebagai ikon SVG lewat `map.addImage` dan symbol layer MapLibre, bukan elemen DOM, agar ringan untuk ratusan titik.

## 4. Tipografi

Huruf: **Plus Jakarta Sans** (Google Fonts, dirancang di Indonesia), cadangan `system-ui, sans-serif`. Angka memakai `font-variant-numeric: tabular-nums` untuk jarak dan waktu agar tidak bergoyang saat berubah.

| Token | Ukuran / tinggi baris | Bobot | Kegunaan |
|---|---|---|---|
| `display` | 24 / 32 | 700 | Judul halaman Tentang |
| `title` | 20 / 28 | 700 | Nama SPBU di detail |
| `heading` | 17 / 24 | 600 | Judul bagian, nama SPBU di daftar |
| `body` | 16 / 24 | 400 | Teks utama (minimum di HP) |
| `label` | 14 / 20 | 600 | Chip, tombol sekunder |
| `caption` | 13 / 18 | 400 | Waktu, jarak, keterangan |

## 5. Spasi, sudut, bayangan

- Skala spasi 4 px: `4, 8, 12, 16, 20, 24, 32, 48`.
- Gutter samping halaman: 16 px di HP, 24 px di desktop.
- Radius: `--r-sm 8px` (chip), `--r-md 12px` (kartu, tombol), `--r-lg 20px` (sudut atas bottom sheet), `--r-full` (FAB, penanda).
- Bayangan hanya dua tingkat: `--shadow-1` untuk kartu di atas peta, `--shadow-2` untuk bottom sheet. Di mode gelap bayangan diganti garis `--border`.

## 6. Ikon

Ikon memakai simbol Unicode monokrom yang dirender sebagai teks dengan warna teks, bukan emoji berwarna. Karakter yang punya bentuk emoji wajib diberi `U+FE0E`. Ikon dekoratif diberi `aria-hidden="true"`, dan tombol yang hanya berisi ikon wajib punya `aria-label`.

| Fungsi | Simbol | Catatan |
|---|---|---|
| Lokasi saya | `◎` | |
| Arahkan | `↗︎` | `U+2197 U+FE0E` |
| Lapor stok | `✎` | |
| Cari | `⌕` | |
| Filter | `≡` | |
| Bagikan | `⤴︎` | `U+2934 U+FE0E` |
| Tutup | `×` | |
| Kembali | `←` | |
| Muat ulang | `↻` | |
| Waktu | `◷` | |
| Antrean | `⋯` | Jumlah titik menunjukkan panjang antrean (lihat 7.8) |
| 24 jam | `◴` | |
| Info | `ⓘ` | |
| Pengumuman | `❖` | |
| Dekorasi brand | `✦` | Di logo teks "✦ Wenten BBM" |

## 7. Tata letak dan komponen

### 7.1 Konsep layout: peta penuh layar dengan kontrol mengambang

Peta selalu mengisi 100% viewport di semua ukuran layar. Semua kontrol adalah **kartu mengambang** di atas peta dengan latar `--surface` 96% opasitas, `backdrop-filter: blur(8px)`, radius `--r-md`, dan `--shadow-1`. Struktur dasarnya terinspirasi pola "kartu atas, dock bawah" yang umum di aplikasi peta krisis, tetapi dibedakan dengan cara berikut:

| Aspek | Pola umum di aplikasi sejenis | Wenten BBM |
|---|---|---|
| Kartu atas | Satu kartu di tengah berisi semua hal | Dipecah dua: **kartu identitas** di kiri (merek, status langsung, angka) dan **kartu kontrol** di kanan (jenis BBM, bahasa, bantuan) |
| Ringkasan | Pil berisi angka per status | **Strip status** dengan bar proporsi tersegmen dan angka, sekaligus berfungsi sebagai filter cepat (ketuk segmen untuk menampilkan status itu saja) |
| Warna status | Hijau, oranye, merah | Monokromatik teal, dibedakan bentuk (`●` `◐` `○` `◌`) |
| Tanda konfirmasi | Cincin hitam | Cincin ganda tipis |
| Daftar | Tidak ada atau terpisah | Laci kanan (desktop) atau bottom sheet (HP) di atas peta, peta tetap terlihat |
| Aksi | Deretan tombol setara | Satu tombol utama "Terdekat yang ada BBM" yang dominan, aksi lain sekunder |
| Lapor | Tombol "Add" umum | Tombol "Lapor" kontekstual yang menyala saat pengguna berada di SPBU |

### 7.2 Layar utama di HP (360 sampai 430 px)

```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │
│ │ ✦ Wenten BBM   ● 20 dtk ⓘ │ │  Kartu identitas ringkas (status langsung)
│ │ [Pertalite][Pertamax][Solar]│ │  Tab jenis BBM, geser horizontal
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │ ███████▒▒░░░░░░             │ │  Strip status: bar proporsi
│ │ ● 97  ◐ 12  ○ 77  ◌ 122     │ │  Ketuk segmen = filter cepat
│ └─────────────────────────────┘ │
│ ❖ Kapal BBM tiba 16 Okt ...  ×  │  Banner pengumuman (opsional)
│                                 │
│          PETA PENUH             │
│     ●        ◐                  │
│          ◉ (Anda)     ○         │
│   ◌            ⦿                │  ⦿ = dikonfirmasi warga
│                            [◎]  │  Lokasi saya
│ ┌─────────────────────────────┐ │
│ │ Anda di SPBU Kapal?    [✎] │ │  Ajakan kontekstual (hanya dalam 300 m)
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │  ◎  Terdekat yang ada BBM   │ │  Tombol utama, lebar penuh, 52 px
│ └─────────────────────────────┘ │
│  [≡ Daftar] [◇ Lapisan] [⤴︎ Bagi] │  Aksi sekunder
└─────────────────────────────────┘
```

- Tombol `ⓘ` membuka menu: Bantuan, Legenda, Data (`/data`), Tentang, pilihan bahasa ID / EN.
- **Daftar** membuka bottom sheet dengan dua titik henti: **half** (55% layar) dan **full** (92% layar). Di posisi full muncul tombol mengambang "Lihat peta".
- **Lapisan** (`◇`) membuka panel kecil berisi toggle: Pengecer, Terminal BBM, Hanya yang dikonfirmasi warga.
- Zoom memakai gestur cubit, tombol `+` `−` disembunyikan di HP.
- Saat detail SPBU terbuka, dock bawah disembunyikan dan digantikan bottom sheet detail.

### 7.3 Layar utama desktop (≥ 1024 px)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────┐            ┌──────────────────────────────┐│
│ │ ✦ Wenten BBM                │            │ [Pertalite][Pertamax][Solar] ││
│ │ ● Langsung · diperbarui 20 dtk│            │ [Pertamax Turbo][Lainnya ▾]  ││
│ │ 1.204 online · 8.310 laporan │            │           ID | EN    ⓘ Bantuan││
│ │ Lihat data →                 │            └──────────────────────────────┘│
│ └──────────────────────────────┘                                            │
│                                                                             │
│                          PETA PENUH LAYAR                                   │
│                                                                             │
│                ●         ┌──────────────────┐                               │
│                          │ Popup SPBU       │                               │
│                          └──────────────────┘                        [+]    │
│ ┌──────────────┐                                                     [−]    │
│ │ Legenda    ▾ │   ┌──────────────────────────────────────────┐      [◎]    │
│ │ ● Tersedia   │   │ ███████▒▒░░░░░░░  ● 97  ◐ 12  ○ 77  ◌ 122 │             │
│ │ ◐ Terbatas   │   └──────────────────────────────────────────┘             │
│ │ ○ Habis      │   [ ◎ Terdekat yang ada BBM ] [≡ Daftar] [◇] [⤴︎ Bagikan]   │
│ │ ◌ Belum ada  │                                                            │
│ │ ⦿ Dikonfirmasi│                                                           │
│ └──────────────┘                    Laporan warga, bukan aplikasi resmi.    │
└────────────────────────────────────────────────────────────────────────────┘
```

- Kartu identitas di kiri atas, kartu kontrol di kanan atas, strip status dan dock di tengah bawah, legenda di kiri bawah, zoom dan lokasi di kanan bawah.
- **Daftar** membuka laci kanan 400 px yang menimpa sebagian peta, kartu kontrol bergeser ke kiri laci.
- Popup SPBU menempel pada penanda (lebar 360 px), tombol "Buka detail" membuka laci kanan pada tab detail.
- Atribusi peta dan penafian berada di pojok kanan bawah dengan ukuran `caption`.

Tablet (640 sampai 1023 px) memakai layout HP dengan kartu atas maksimal 560 px rata tengah dan sheet maksimal 560 px.

### 7.4 Item daftar SPBU

```
┌─────────────────────────────────────────┐
│ ●  SPBU Kapal 54.803.xx          1,2 km │
│    Jl. Raya Kapal, Mengwi               │
│    Ada Pertalite · Habis Pertamax       │
│    ◷ 12 mnt lalu · ⋯⋯ antre sedang      │
│                            [↗︎ Arahkan]  │
└─────────────────────────────────────────┘
```

- Tinggi minimum 96 px, seluruh kartu bisa diketuk untuk membuka detail.
- Baris status BBM menampilkan maksimal tiga jenis, jenis yang sedang difilter selalu tampil pertama.
- Urutan bawaan: jarak terdekat. Pilihan lain: laporan terbaru, status (Tersedia dulu).
- SPBU berstatus Belum ada laporan tetap tampil tetapi diletakkan setelah SPBU berstatus, dengan ajakan "Jadilah yang pertama melapor".

### 7.5 Detail SPBU (popup)

Di HP tampil sebagai bottom sheet posisi half yang bisa ditarik ke full. Di desktop tampil sebagai kartu popup 360 px yang menempel pada penanda, dengan tombol "Buka detail" ke laci kanan. Bagian "Perkiraan waktu antre" dan "Kabar antrean" (P1) disisipkan di bawah baris Antrean.

```
┌─────────────────────────────────────────┐
│ ← SPBU Kapal                         ×  │
│   Pertamina · 54.803.xx · ◴ 24 jam      │
│   Jl. Raya Kapal, Mengwi · 1,2 km       │
│                                         │
│   ●  Tersedia                           │  Status keseluruhan, ukuran title
│   ◷ Laporan terakhir 12 menit lalu      │
│                                         │
│   Pertalite       ● Ada       12 mnt    │
│   Pertamax        ○ Habis     12 mnt    │
│   Pertamax Turbo  ◌ ?          -        │
│   Dexlite         ◐ Terbatas  48 mnt    │
│   Antrean         ⋯⋯ Sedang             │
│                                         │
│ [ ↗︎ Arahkan             ] [⤴︎] [✎]     │  Arahkan = tombol utama penuh
│                                         │
│   Laporan terbaru                       │
│   ┌───────────────────────────────────┐ │
│   │ 19.02 · Pertalite Ada, Pertamax   │ │
│   │ Habis · antre sedang              │ │
│   │ "Pertamax habis sejak siang"      │ │
│   │ [Masih benar · 3] [Tidak benar·0] │ │
│   └───────────────────────────────────┘ │
│   ...hingga 5 laporan                   │
│                                         │
│   ⓘ Laporan warga, bukan data resmi     │
│     SPBU. Selalu periksa di lokasi.     │
└─────────────────────────────────────────┘
```

Aturan tombol:

- **Arahkan** selalu aktif, membuka Google Maps. Menu kecil di sampingnya: "Aplikasi peta lain" dan "Salin koordinat".
- **Lapor** (`✎`) aktif hanya dalam radius 300 m. Jika tidak, ketukan menampilkan penjelasan: "Lapor hanya bisa dilakukan saat Anda berada di SPBU ini (maksimal 300 m), supaya laporan tetap akurat."
- **Masih benar / Tidak benar** mengikuti aturan radius yang sama, tidak tampil pada laporan milik sendiri.

### 7.6 Form laporan

Ditampilkan sebagai bottom sheet full. Tujuan: selesai dalam 3 ketukan untuk kasus umum.

```
┌─────────────────────────────────────────┐
│ ← Lapor stok · SPBU Kapal               │
│   Lokasi Anda terverifikasi · 40 m      │
│                                         │
│   Pertalite                             │
│   [ Ada ][ Terbatas ][ Habis ][ ? ]     │  Kontrol segmen, bawaan "?"
│   Pertamax                              │
│   [ Ada ][ Terbatas ][ Habis ][ ? ]     │
│   ...hanya BBM yang dijual SPBU ini     │
│                                         │
│   Antrean                               │
│   [ Tidak ada ][ Pendek ][ Sedang ][ Panjang ] │
│                                         │
│   Catatan (opsional)            0/140   │
│   [                                   ] │
│                                         │
│ [            Kirim laporan            ] │  Nonaktif sampai minimal 1 BBM diisi
└─────────────────────────────────────────┘
```

- Kontrol segmen minimal tinggi 44 px, label teks lengkap, simbol status di kiri label.
- Pintasan "Semua ada" dan "Semua habis" tampil di atas daftar untuk mempercepat.
- Setelah sukses: sheet tertutup, toast "Terima kasih, laporan Anda membantu warga lain.", penanda SPBU beranimasi skala halus satu kali (200 ms).
- Pesan galat ditampilkan inline di atas tombol Kirim, bahasa sederhana, selalu dengan saran tindakan.

### 7.7 Mode "Saya di antrean ini" dan kabar antrean (P1)

```
┌─────────────────────────────────────────┐
│ SPBU Kapal · Pertalite                  │
│ ● 5 orang memantau antrean ini          │
│ ┌─────────────────────────────────────┐ │
│ │ Perkiraan waktu tunggu Anda         │ │  Kartu latar --teal-50, garis --teal-200
│ │ Sekitar 25 sampai 35 menit          │ │  ukuran display
│ │ Antrean sekitar 300 m dari pompa    │ │
│ └─────────────────────────────────────┘ │
│ ◆ Jepun 21                       4 mnt  │  Kabar antrean, simbol pembeda
│   Dapat BBM setelah 32 menit            │  per nama samaran (◆ ▲ ■ ●)
│ ▲ Cempaka 07                     9 mnt  │  dalam satu warna teks
│   Tangki baru datang, mulai jalan lagi  │
│ ■ Kamboja 66                    12 mnt  │
│   Maksimal Rp50 ribu per pengisian      │
│ [ Tulis kabar antrean...      ] [ → ]   │
│ [  Sudah dapat BBM  ] [ Keluar antrean ]│
└─────────────────────────────────────────┘
```

- Nama samaran dibuat dari hash ID perangkat: kata flora atau tempat khas Bali ditambah dua digit. Pembeda antarpengirim memakai **simbol**, bukan warna berbeda, agar tetap dalam satu skema warna.
- Saat mode aktif, bar kecil menempel di atas dock: "Anda di antrean SPBU Kapal · 12 menit" dengan tombol "Selesai".

### 7.8 Komponen inti

| Komponen | Props utama | Catatan |
|---|---|---|
| `StatusGlyph` | `status`, `size`, `stale` | Simbol + `aria-label` teks status |
| `StatusChip` | `fuel`, `status`, `ageMinutes` | "Ada Pertalite" |
| `QueueIndicator` | `level` | `none` → "Tidak antre", `short` → `⋯`, `medium` → `⋯⋯`, `long` → `⋯⋯⋯` plus label |
| `RelativeTime` | `at` | "12 mnt lalu", ketuk untuk jam WITA, diperbarui tiap 30 detik |
| `FuelFilterBar` | `selected`, `onChange` | Chip geser horizontal, chip aktif isi `--accent` |
| `StationMap` | `stations`, `selectedId`, `fuelFilter` | MapLibre, symbol layer, klaster |
| `StationListItem` | `station`, `distanceM` | |
| `StationSheet` | `stationId` | Detail SPBU |
| `ReportSheet` | `station`, `userPosition` | Form laporan |
| `NearbyPrompt` | `station` | Ajakan kontekstual |
| `AnnouncementBanner` | `announcement` | Bisa ditutup, tersimpan per perangkat |
| `OfflineBanner` | `lastUpdatedAt` | |
| `BottomSheet` | `snapPoints`, `initial` | Dukungan gestur dan keyboard |
| `NavigateButton` | `lat`, `lng`, `name` | Menghasilkan tautan Google Maps |
| `IdentityCard` | `liveAt`, `onlineNow`, `reportsTotal` | Kartu kiri atas, titik "Langsung" berdenyut pelan (dimatikan bila reduced motion) |
| `ControlCard` | `fuel`, `locale` | Tab jenis BBM, ID/EN, bantuan |
| `StatusStrip` | `counts`, `activeStatus`, `onSelect` | Bar proporsi tersegmen + angka, segmen bisa diketuk sebagai filter |
| `ActionDock` | `onNearest`, `onList`, `onLayers`, `onShare` | Dock bawah, tombol utama "Terdekat yang ada BBM" |
| `MapLegend` | `collapsed` | Kiri bawah di desktop, di menu `ⓘ` di HP |
| `LayerPanel` | `layers` | Toggle pengecer, TBBM, hanya dikonfirmasi |
| `QueueMode` (P1) | `stationId` | Mode antre, estimasi, kabar antrean |

## 8. Status layar khusus

| Situasi | Tampilan |
|---|---|
| Memuat pertama kali | Peta dasar tampil lebih dulu, kartu atas dan strip status berupa skeleton sampai snapshot tiba |
| Izin lokasi ditolak | Peta di Denpasar, kartu: "Aktifkan lokasi untuk melihat SPBU terdekat, atau cari wilayah Anda." dengan tombol "Cari wilayah" |
| GPS tidak akurat | Lingkaran akurasi tampil di peta, tombol lapor menjelaskan "Sinyal GPS kurang akurat, coba di area terbuka." |
| Offline | Banner tetap di atas: "Anda sedang offline. Menampilkan data pukul 19.02 WITA." |
| Tidak ada SPBU tersedia di sekitar | "Belum ada laporan SPBU tersedia dalam 5 km. Perluas area atau periksa lagi beberapa saat." Tombol "Perluas ke 15 km" |
| Mode baca-saja (darurat) | Tombol lapor nonaktif, banner: "Pelaporan sementara dihentikan untuk pemeliharaan." |
| Galat server | "Gagal memuat data terbaru. Menampilkan data terakhir." dengan tombol `↻` |

## 9. Pedoman bahasa

- Bahasa Indonesia sehari-hari yang sopan, kalimat pendek. Antarmuka bahasa Inggris tersedia sejak MVP dengan nada yang sama.
- Gunakan "Habis", bukan "KOSONG", "LANGKA", atau tanda seru.
- Gunakan "dilaporkan" untuk menunjukkan sumber: "Dilaporkan tersedia 12 menit lalu".
- Hindari angka yang memancing kepanikan seperti "90% SPBU habis". Ringkasan selalu dibingkai positif dan berguna: "8 SPBU tersedia dalam 5 km".
- Selalu beri arah tindakan pada pesan galat.
- Waktu absolut memakai format 24 jam dan zona WITA: "19.02 WITA".
- Jarak: di bawah 1 km dalam meter dibulatkan ke 50 m ("650 m"), di atas 1 km satu desimal ("1,2 km").

## 10. Gerak

- Durasi standar 200 ms, bottom sheet 280 ms, kurva `cubic-bezier(0.2, 0, 0, 1)`.
- Perubahan status penanda via realtime: transisi isi warna 300 ms, tanpa kedip.
- Hormati `prefers-reduced-motion`: semua animasi diganti perubahan instan.

## 11. Aksesibilitas

- Kontras teks minimal 4,5:1, objek grafis minimal 3:1.
- Status selalu punya label teks dan `aria-label` pada penanda, misalnya "SPBU Kapal, tersedia, dilaporkan 12 menit lalu, 1,2 kilometer".
- Peta punya alternatif penuh lewat daftar, sehingga pengguna pembaca layar tidak perlu berinteraksi dengan peta.
- Fokus keyboard terlihat jelas (cincin 2 px `--focus` dengan jarak 2 px).
- Bottom sheet bisa dioperasikan dengan keyboard dan mengunci fokus saat posisi full.
- Simbol dekoratif `aria-hidden="true"`, teks bahasa diatur dengan `lang="id"`.

## 12. Halaman data publik (`/data`)

Halaman transparansi yang menunjukkan skala krisis dan keandalan layanan. Memakai tema yang sama dengan peta (mengikuti mode terang atau gelap perangkat), lebar konten maksimal 1040 px, rata tengah.

### 12.1 Wireframe

```
┌──────────────────────────────────────────────────────────────────┐
│ Data Wenten BBM                                  [← Kembali ke peta] │
│ ● Langsung · diperbarui 20.22 · semua waktu dalam WITA            │
│                                                                  │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐      │
│ │ Pengunjung │ │ Laporan    │ │ SPBU dengan│ │ Ketersediaan│     │
│ │ unik       │ │ diterima   │ │ laporan    │ │ layanan     │     │
│ │ 443.994    │ │ 32.626     │ │ segar      │ │ 99,2%       │     │
│ │ sejak 09.37│ │ dari 19.991│ │ 186 / 308  │ │ sejak rilis │     │
│ │            │ │ pelapor    │ │            │ │             │     │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘      │
│                                                                  │
│ Kondisi sekarang per wilayah            [Pertalite ▾]            │
│ Denpasar   ███████▒▒▒░░░░  ● 21 ◐ 4 ○ 9 ◌ 6                      │
│ Badung     █████▒▒░░░░░░░  ● 18 ◐ 3 ○ 14 ◌ 9                     │
│ ...9 kabupaten/kota, urut jumlah SPBU                            │
│                                                                  │
│ Laporan per jam (48 jam terakhir)                                │
│ ● Ada  ◐ Terbatas  ○ Habis · spam tidak dihitung                 │
│  ▁▂▃▅▆█▇▅▄▃▄▆█▇▆▅                                                │
│ Tampilkan sebagai tabel                                          │
│                                                                  │
│ Perkiraan waktu antre rata-rata (P1)                             │
│  garis median + pita rentang                                     │
│                                                                  │
│ Ketersediaan layanan sejak rilis                                 │
│ ████████▒███████░██████████████████████████████████              │
│ 08.54        16.00        23.05        06.11        20.22        │
│ ■ Berjalan penuh  ▒ Sebagian  ░ Tidak bisa diakses               │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │
│ │ 34 j 33 mnt  │ │ 36 mnt       │ │ 18 mnt       │               │
│ │ berjalan penuh│ │ sebagian     │ │ tidak bisa   │               │
│ └──────────────┘ └──────────────┘ └──────────────┘               │
│ Catatan gangguan                                                 │
│ 14.59–15.11  [◆ SPAM]     Penjelasan singkat...                  │
│ 15.40–16.16  [◐ SEBAGIAN] Penjelasan singkat...                  │
│                                                                  │
│ Perlindungan spam                                                │
│ Ditolak 24 jam terakhir: di luar radius 812 · terlalu sering     │
│ 245 · laporan dikarantina 3.410 · tempat dikarantina 1.106       │
│                                                                  │
│ Cara kerja dan privasi                                           │
│ Penjelasan metodologi status, apa yang disimpan, berapa lama.    │
│ [Unduh data agregat CSV] (P1) · Lisensi CC BY 4.0                │
└──────────────────────────────────────────────────────────────────┘
```

Angka di wireframe hanya contoh tata letak.

### 12.2 Aturan visual

- **Kartu statistik**: angka ukuran 32 / 40 bobot 700 `tabular-nums`, label `caption` `--text-muted` di atas, keterangan `caption` di bawah. Empat kolom di desktop, dua kolom di HP.
- **Grafik laporan per jam**: bar bertumpuk satu warna dengan tingkat berbeda: Ada `--teal-600`, Terbatas `--teal-300`, Habis `--teal-900`. Di mode gelap: `--teal-300`, `--teal-200`, `#E4F1EF`. Habis diberi pola garis miring tipis agar tetap terbedakan saat dicetak hitam putih. Sumbu Y dimulai dari 0.
- **Bar ketersediaan layanan**: berjalan penuh `--teal-600` padat, sebagian `--teal-300` dengan pola garis, tidak bisa diakses `--teal-900` dengan pola titik. Kartu durasi memakai garis kiri 4 px dengan tingkat warna dan pola yang sama.
- **Lencana gangguan**: teks huruf kapital kecil di dalam kotak bergaris, dibedakan simbol: `◆ SPAM`, `◐ SEBAGIAN`, `○ TIDAK BISA DIAKSES`, `◇ PEMELIHARAAN`.
- **Bar per wilayah**: sama dengan strip status di peta, bisa dipilih per jenis BBM.
- Setiap grafik punya tautan "Tampilkan sebagai tabel" untuk aksesibilitas, dan `aria-describedby` berisi ringkasan teks (misalnya "Puncak laporan pukul 10.00 WITA, 1.760 laporan").
- Tooltip grafik muncul saat diarahkan atau diketuk, berisi jam dan angka per status.
- Grafik digambar dengan **uPlot** (ringan) dan dirender di klien, angka kartu dirender di server agar langsung terlihat.

## 13. Panel admin

Memakai token yang sama, layout tabel padat untuk desktop.

- **Antrean moderasi**: tabel laporan dengan kolom waktu, SPBU, isi, konfirmasi, bantahan, jarak pelapor, aksi (Sembunyikan, Blokir pelapor).
- **SPBU**: tabel dengan pencarian, formulir ubah dengan peta mini untuk menggeser titik lokasi.
- **Pengumuman**: daftar, formulir dengan pratinjau banner.
- **Pengaturan**: nilai parameter status dari `app_settings` dengan penjelasan dan batas aman, plus sakelar mode baca-saja darurat.
- **Gangguan**: formulir mencatat gangguan layanan (jenis, waktu mulai dan selesai, penjelasan publik) yang tampil di halaman `/data`.
- **Karantina**: daftar laporan dan tempat yang dikarantina otomatis, dengan aksi massal Lepaskan atau Hapus.
- **Log audit**: daftar tindakan admin.
