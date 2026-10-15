# Wenten BBM

Semeton bantu semeton cek BBM Bali. Dokumen acuan: [PRD](PRD.md), [DESIGN](DESIGN.md), [ERD](ERD.md), [ARCHITECTURE](ARCHITECTURE.md).

## Menjalankan (mode demo, tanpa database)

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Tanpa variabel Supabase, aplikasi memakai backend tiruan di memori server (`apps/web/lib/demo/store.ts`) dengan 323 titik dari OpenStreetMap, laporan simulasi, dan logika status yang sama dengan SQL. Di detail SPBU ada tombol "Demo: anggap saya di SPBU ini" untuk mencoba laporan tanpa harus berada di lokasi. Data hilang saat server restart.

## Menjalankan dengan Supabase

1. `cd packages/db && npx supabase start` (butuh Docker), `npx supabase db reset` menerapkan migrasi 0001-0006 dan `seed.sql`.
2. Salin `apps/web/.env.example` menjadi `.env.local`, isi URL dan anon key.
3. Produksi: aktifkan Anonymous Sign-In dan captcha Turnstile di Auth, buat bucket `snapshots`, deploy Edge Functions, lalu isi Vault: `select vault.create_secret('<url>', 'project_url'); select vault.create_secret('<service_role_key>', 'service_role_key');`
4. Tes logika status: `npx supabase test db`.

## Struktur

| Path | Isi |
|---|---|
| `apps/web` | PWA Next.js: peta, daftar, detail, form lapor, `/data`, `/tentang` |
| `packages/core` | Tipe domain, jarak, format WITA, pemilihan terdekat (tes Vitest) |
| `packages/ui` | Token desain (`tokens.css`) |
| `packages/db` | Migrasi, fungsi RPC, RLS, cron, Edge Functions, tes pgTAP, impor OSM |

## Belum dibangun

- `apps/admin` (panel moderasi). Fungsi `admin_*` di database sudah siap dipanggil.
- Fitur P1 (mode antre, kabar antrean, usulan SPBU, foto) dan P2. Tabelnya sudah ada di skema.
- Migrasi SQL dan tes pgTAP belum dijalankan terhadap Postgres sungguhan (Docker tidak tersedia saat pengembangan).
- Data SPBU hasil impor OSM wajib diverifikasi manual sebelum rilis.

## SEO

Sudah ada di kode: `/sitemap.xml` (semua SPBU, wilayah, dan halaman, dengan hreflang id/en), `/robots.txt`, canonical per halaman, data terstruktur schema.org (WebSite, Organization, GasStation, ItemList), halaman per kabupaten `/wilayah/{slug}`, gambar pratinjau OG per SPBU, dan teks yang bisa dibaca mesin pencari di halaman peta.

Yang perlu dilakukan setelah deploy:

1. Isi `NEXT_PUBLIC_SITE_URL` dengan domain asli (tanpa garis miring di akhir). Sitemap, canonical, dan OG memakai nilai ini.
2. Daftarkan domain di [Google Search Console](https://search.google.com/search-console) (metode tag HTML: isi kodenya di `GOOGLE_SITE_VERIFICATION`), lalu kirim `https://domain-anda/sitemap.xml`.
3. Daftarkan juga di Bing Webmaster Tools (bisa impor dari Search Console).
4. Minta indeks untuk halaman utama dan beberapa halaman `/wilayah/...` lewat URL Inspection.
5. Bagikan tautan ke grup komunitas, media lokal, dan situs Pemda. Tautan masuk dari situs lain sangat membantu peringkat.
