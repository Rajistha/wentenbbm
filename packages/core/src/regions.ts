// Sama dengan seed tabel regions (ERD.md bagian 6).
export const REGIONS: { id: number; slug: string; name: string }[] = [
  { id: 1, slug: "denpasar", name: "Kota Denpasar" },
  { id: 2, slug: "badung", name: "Badung" },
  { id: 3, slug: "gianyar", name: "Gianyar" },
  { id: 4, slug: "tabanan", name: "Tabanan" },
  { id: 5, slug: "jembrana", name: "Jembrana" },
  { id: 6, slug: "buleleng", name: "Buleleng" },
  { id: 7, slug: "bangli", name: "Bangli" },
  { id: 8, slug: "klungkung", name: "Klungkung" },
  { id: 9, slug: "karangasem", name: "Karangasem" },
];

export const REGION_NAMES: Record<number, string> = Object.fromEntries(REGIONS.map((r) => [r.id, r.name]));
