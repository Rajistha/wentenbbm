"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REGIONS } from "@wenten/core";
import { useCallback, useEffect, useState } from "react";
import { IS_DEMO } from "@/lib/env";
import { getSupabase } from "@/lib/supabase/client";
import { Icon } from "../common/Icon";
import { Logo } from "../common/Logo";
import { runTurnstile } from "../session/turnstile";

type Json = Record<string, unknown>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TABS = [
  ["ringkasan", "Ringkasan"],
  ["laporan", "Laporan"],
  ["tempat", "Tempat"],
  ["koreksi", "Koreksi"],
  ["pengumuman", "Pengumuman"],
  ["pengaturan", "Pengaturan"],
] as const;
type Tab = (typeof TABS)[number][0];

type Auth = "loading" | "out" | "denied" | "admin";

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const wita = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Panel admin sederhana: moderasi laporan, tempat usulan warga, koreksi, pengumuman, dan pengaturan. */
export function AdminApp() {
  const [sb, setSb] = useState<SupabaseClient | null>(null);
  const [auth, setAuth] = useState<Auth>("loading");
  const [tab, setTab] = useState<Tab>("ringkasan");

  const check = useCallback(async (client: SupabaseClient) => {
    const { data } = await client.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return setAuth("out");
    const { data: ok } = await client.rpc("is_admin");
    setAuth(ok === true ? "admin" : "denied");
  }, []);

  useEffect(() => {
    if (IS_DEMO) return setAuth("denied");
    getSupabase().then((c) => {
      setSb(c);
      void check(c);
    });
  }, [check]);

  if (IS_DEMO) return <Shell><p>Panel admin hanya tersedia saat Supabase terhubung.</p></Shell>;
  if (auth === "loading" || !sb) return <Shell><p className="muted">Memuat…</p></Shell>;
  if (auth === "out") return <Login sb={sb} onDone={() => check(sb)} />;
  if (auth === "denied") {
    return (
      <Shell>
        <p>Akun ini bukan admin. Beri peran admin lewat SQL Editor Supabase (lihat OPERATIONS.md), lalu muat ulang.</p>
        <button type="button" className="btn" onClick={async () => { await sb.auth.signOut(); setAuth("out"); }}>Keluar</button>
      </Shell>
    );
  }

  return (
    <Shell
      right={
        <button type="button" className="btn" onClick={async () => { await sb.auth.signOut(); setAuth("out"); }}>
          Keluar
        </button>
      }
    >
      <nav className="adm-tabs" aria-label="Bagian admin">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "ringkasan" && <Overview sb={sb} />}
      {tab === "laporan" && <Reports sb={sb} />}
      {tab === "tempat" && <Places sb={sb} />}
      {tab === "koreksi" && <Corrections sb={sb} />}
      {tab === "pengumuman" && <Announcements sb={sb} />}
      {tab === "pengaturan" && <Settings sb={sb} />}
    </Shell>
  );
}

function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <main className="adm">
      <header className="adm-top">
        <h1>Admin Wenten BBM</h1>
        {right}
      </header>
      {children}
    </main>
  );
}

function Login({ sb, onDone }: { sb: SupabaseClient; onDone(): void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const captchaToken = await runTurnstile();
      const { error: err } = await sb.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined });
      if (err) setError(err.message === "Invalid login credentials" ? "Email atau kata sandi salah." : err.message);
      else onDone();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (m.startsWith("turnstile")) {
        const code = m.split(":")[1];
        setError(
          `Verifikasi captcha gagal${code ? ` (kode ${code})` : ""}. Pastikan ${location.hostname} terdaftar di widget Turnstile Cloudflare (untuk uji lokal tambahkan localhost) dan site key benar.`,
        );
      } else {
        setError("Gagal masuk. Periksa koneksi lalu coba lagi.");
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="adm-auth">
      <form className="adm-auth-card" onSubmit={submit}>
        <Logo size={36} />
        <h1>Masuk admin</h1>
        <p className="adm-auth-sub">Khusus pengelola Wenten BBM.</p>
        <label className="adm-field">
          <span>Email</span>
          <input type="email" autoComplete="username" inputMode="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="adm-field">
          <span>Kata sandi</span>
          <span className="adm-pass">
            <input
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="button" className="adm-eye" onClick={() => setShow((v) => !v)} aria-pressed={show}>
              {show ? "Sembunyikan" : "Tampilkan"}
            </button>
          </span>
        </label>
        {error && (
          <div className="adm-auth-error" role="alert">
            <Icon name="alert" size={16} /> {error}
          </div>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
        <p className="adm-auth-foot">Dilindungi captcha. Akses dicatat.</p>
      </form>
    </main>
  );
}

/** Panggil fungsi admin; lemparkan pesan bila ditolak. */
async function adm(sb: SupabaseClient, fn: string, args?: Json): Promise<Row> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  if (data && data.ok === false) throw new Error(data.code ?? "Gagal");
  return (data ?? {}) as Row;
}

function useLoad(sb: SupabaseClient, fn: string, args: Json = {}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(args);
  const reload = useCallback(() => {
    setError(null);
    adm(sb, fn, JSON.parse(key))
      .then((d) => setRows((d.rows as Row[]) ?? []))
      .catch((e) => setError(String(e.message ?? e)));
  }, [sb, fn, key]);
  useEffect(reload, [reload]);
  return { rows, error, reload };
}

function Overview({ sb }: { sb: SupabaseClient }) {
  const [d, setD] = useState<Row | null>(null);
  const [geofence, setGeofence] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setD(await adm(sb, "admin_overview"));
      const s = await adm(sb, "admin_list_settings");
      const row = (s.rows as Row[]).find((x) => x.key === "geofence_enabled");
      setGeofence(row ? row.value === true : null);
    } catch (e) {
      setError(String((e as Error).message));
    }
  }, [sb]);
  useEffect(() => void load(), [load]);
  if (error) return <p className="form-error">{error}</p>;
  if (!d) return <p className="muted">Memuat…</p>;
  const cards: [string, unknown][] = [
    ["Tempat menunggu tinjauan", d.places_pending],
    ["Tempat usulan warga", d.places_by_users],
    ["Laporan ditandai warga", d.reports_flagged],
    ["Laporan dikarantina", d.reports_quarantined],
    ["Laporan 24 jam", d.reports_24h],
    ["Koreksi menunggu", d.corrections_pending],
    ["Pelanggaran 24 jam", d.abuse_24h],
    ["Perangkat diblokir", d.profiles_blocked],
  ];
  const toggle = async () => {
    if (!window.confirm(d.read_only ? "Buka kembali pelaporan?" : "Hentikan sementara semua pelaporan?")) return;
    await adm(sb, "admin_set_setting", { p_key: "read_only", p_value: !d.read_only });
    void load();
  };
  const toggleGeofence = async () => {
    const next = !geofence;
    if (!window.confirm(next ? "Wajibkan pelapor berada dalam radius 300 m dari SPBU?" : "Matikan syarat radius? Warga bisa melapor dari mana saja, sehingga laporan lebih mudah dipalsukan.")) return;
    await adm(sb, "admin_set_setting", { p_key: "geofence_enabled", p_value: next });
    void load();
  };
  return (
    <>
      <div className="adm-cards">
        {cards.map(([label, v]) => (
          <div key={label} className="adm-card">
            <div className="adm-num">{String(v ?? 0)}</div>
            <div className="caption muted">{label}</div>
          </div>
        ))}
      </div>
      <div className="adm-box">
        <strong>Mode baca-saja</strong>: {d.read_only ? "AKTIF (pelaporan dihentikan)" : "mati"}
        <button type="button" className={`btn ${d.read_only ? "btn-primary" : ""}`} onClick={toggle}>
          {d.read_only ? "Buka pelaporan" : "Hentikan pelaporan"}
        </button>
      </div>
      <div className="adm-box" style={{ marginTop: 10 }}>
        <span>
          <strong>Syarat radius 300 m</strong>:{" "}
          {geofence == null ? "belum tersedia (jalankan migrasi 0018)" : geofence ? "aktif (hanya yang berada di SPBU bisa melapor)" : "MATI (melapor dari mana saja)"}
        </span>
        {geofence != null && (
          <button type="button" className={`btn ${geofence ? "" : "btn-primary"}`} onClick={toggleGeofence}>
            {geofence ? "Matikan syarat radius" : "Aktifkan syarat radius"}
          </button>
        )}
      </div>
    </>
  );
}

function Reports({ sb }: { sb: SupabaseClient }) {
  const [filter, setFilter] = useState("flagged");
  const { rows, error, reload } = useLoad(sb, "admin_moderation_queue", { p_filter: filter, p_limit: 100 });
  const [fuels, setFuels] = useState<Record<number, string>>({});
  useEffect(() => {
    sb.from("fuel_types").select("id,name").then(({ data }) => setFuels(Object.fromEntries((data ?? []).map((f) => [f.id, f.name]))));
  }, [sb]);

  const setStatus = async (id: string, status: "hidden" | "active") => {
    await adm(sb, "admin_set_report_status", { p_ids: [id], p_status: status, p_note: null });
    reload();
  };
  const block = async (r: Row) => {
    const reason = window.prompt(`Blokir ${r.pseudonym}? Tulis alasan singkat:`);
    if (!reason) return;
    await adm(sb, "admin_block_profile", { p_profile: r.reporter_id, p_block: true, p_reason: reason, p_hide_recent: true });
    reload();
  };
  return (
    <>
      <div className="chip-row">
        {[["flagged", "Ditandai warga"], ["quarantined", "Dikarantina"], ["hidden", "Disembunyikan"], ["recent", "24 jam terakhir"]].map(([k, l]) => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k!)}>{l}</button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {rows?.length === 0 && <p className="muted">Tidak ada laporan.</p>}
      {rows?.map((r) => (
        <div key={r.id} className="adm-row">
          <div className="grow">
            <strong>{r.station_name}</strong> <span className="caption muted">{wita(r.created_at)} · {r.moderation_status}</span>
            <div className="caption">
              {(r.items as [number, string][] | null)?.map(([f, a]) => `${fuels[f] ?? f}: ${a}`).join(", ")}
              {r.queue_level ? ` · antre ${r.queue_level}` : ""}
              {r.wait_minutes != null ? ` · ${r.wait_minutes} mnt` : ""}
            </div>
            <div className="caption muted">
              {r.pseudonym}{r.is_blocked ? " (diblokir)" : ""} · {r.report_count} laporan, {r.disputed_count} disanggah · jarak {r.distance_m} m · akurasi {Math.round(r.accuracy_m)} m · +{r.confirms} / −{r.disputes}
              {r.quarantine_reason ? ` · ${r.quarantine_reason}` : ""}
            </div>
            {r.note && <div className="caption">“{r.note}”</div>}
          </div>
          <div className="adm-actions">
            {r.moderation_status === "active" ? (
              <button type="button" className="btn" onClick={() => setStatus(r.id, "hidden")}>Sembunyikan</button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setStatus(r.id, "active")}>Pulihkan</button>
            )}
            {!r.is_blocked && <button type="button" className="btn" onClick={() => block(r)}>Blokir pelapor</button>}
          </div>
        </div>
      ))}
    </>
  );
}

function Places({ sb }: { sb: SupabaseClient }) {
  const [filter, setFilter] = useState("quarantined");
  const { rows, error, reload } = useLoad(sb, "admin_list_places", { p_filter: filter, p_limit: 100 });
  const patch = async (id: string, p: Json) => {
    await adm(sb, "admin_update_station", { p_id: id, p_patch: p });
    reload();
  };
  return (
    <>
      <div className="chip-row">
        {[["quarantined", "Menunggu tinjauan"], ["user", "Semua usulan warga"], ["hidden", "Disembunyikan"]].map(([k, l]) => (
          <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k!)}>{l}</button>
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      {rows?.length === 0 && <p className="muted">Tidak ada tempat.</p>}
      {rows?.map((p) => (
        <div key={p.id} className="adm-row">
          <div className="grow">
            <strong>{p.name}</strong> <span className="caption muted">{p.kind} · {p.moderation_status}{p.is_active ? "" : " · nonaktif"}</span>
            <div className="caption muted">
              {p.address ?? "-"} · <a href={mapsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">{p.lat}, {p.lng}</a> · {p.pseudonym ?? "OSM"} · {wita(p.created_at)}
            </div>
          </div>
          <div className="adm-actions">
            <button type="button" className="btn btn-primary" onClick={() => patch(p.id, { moderation_status: "approved", is_active: true })}>Setujui</button>
            <button type="button" className="btn" onClick={() => { const n = window.prompt("Nama baru", p.name); if (n) void patch(p.id, { name: n }); }}>Ubah nama</button>
            <button type="button" className="btn" onClick={() => window.confirm(`Tolak dan sembunyikan ${p.name}?`) && patch(p.id, { moderation_status: "rejected", is_active: false })}>Tolak</button>
          </div>
        </div>
      ))}
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  wrong_location: "Lokasi salah",
  closed: "Sudah tutup",
  wrong_fuels: "BBM tidak sesuai",
  duplicate: "Data ganda",
  other: "Lainnya",
};

function Corrections({ sb }: { sb: SupabaseClient }) {
  const { rows, error, reload } = useLoad(sb, "admin_list_corrections", { p_status: "pending", p_limit: 100 });
  const resolve = async (id: string, status: "approved" | "rejected") => {
    await adm(sb, "admin_resolve_correction", { p_id: id, p_status: status });
    reload();
  };
  return (
    <>
      <p className="caption muted">Menyetujui koreksi lokasi langsung memindahkan titik; menyetujui "sudah tutup" menyembunyikan tempat. Jenis lain hanya ditandai selesai, ubah datanya lewat tab Tempat.</p>
      {error && <p className="form-error">{error}</p>}
      {rows?.length === 0 && <p className="muted">Tidak ada koreksi menunggu.</p>}
      {rows?.map((c) => (
        <div key={c.id} className="adm-row">
          <div className="grow">
            <strong>{c.station_name}</strong> <span className="caption muted">{KIND_LABEL[c.kind] ?? c.kind} · {wita(c.created_at)} · {c.pseudonym}</span>
            {c.note && <div className="caption">“{c.note}”</div>}
            <div className="caption muted">
              Saat ini: <a href={mapsUrl(c.lat, c.lng)} target="_blank" rel="noopener noreferrer">{c.lat}, {c.lng}</a>
              {c.proposed_lat != null && (
                <> · Usulan: <a href={mapsUrl(c.proposed_lat, c.proposed_lng)} target="_blank" rel="noopener noreferrer">{c.proposed_lat}, {c.proposed_lng}</a> (geser {c.moved_m} m)</>
              )}
            </div>
          </div>
          <div className="adm-actions">
            <button type="button" className="btn btn-primary" onClick={() => resolve(c.id, "approved")}>Setujui</button>
            <button type="button" className="btn" onClick={() => resolve(c.id, "rejected")}>Tolak</button>
          </div>
        </div>
      ))}
    </>
  );
}

function Announcements({ sb }: { sb: SupabaseClient }) {
  const { rows, error, reload } = useLoad(sb, "admin_list_announcements");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState("info");
  const [hours, setHours] = useState("6");
  const [region, setRegion] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await adm(sb, "admin_upsert_announcement", {
        p: { title, body, level, region_id: region, ends_at: new Date(Date.now() + Number(hours) * 3600_000).toISOString() },
      });
      setTitle("");
      setBody("");
      reload();
    } catch (err) {
      setMsg(String((err as Error).message));
    }
  };
  const del = async (id: string) => {
    if (!window.confirm("Hapus pengumuman ini?")) return;
    await adm(sb, "admin_delete_announcement", { p_id: id });
    reload();
  };
  return (
    <>
      <form className="adm-form" onSubmit={save}>
        <label>Judul<input required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Isi<textarea required rows={2} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="adm-inline">
          <label>Tingkat
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="info">Info</option>
              <option value="important">Penting</option>
            </select>
          </label>
          <label>Tayang (jam)
            <input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          <label>Wilayah
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Seluruh Bali</option>
              {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        {msg && <div className="form-error">{msg}</div>}
        <button className="btn btn-primary">Terbitkan</button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {rows?.map((a) => (
        <div key={a.id} className="adm-row">
          <div className="grow">
            <strong>{a.title}</strong> <span className="caption muted">{a.level} · sampai {wita(a.ends_at)}</span>
            <div className="caption">{a.body}</div>
          </div>
          <div className="adm-actions"><button type="button" className="btn" onClick={() => del(a.id)}>Hapus</button></div>
        </div>
      ))}
    </>
  );
}

function Settings({ sb }: { sb: SupabaseClient }) {
  const { rows, error, reload } = useLoad(sb, "admin_list_settings");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const save = async (key: string) => {
    let value: unknown;
    try {
      value = JSON.parse(edits[key]!);
    } catch {
      return window.alert("Nilai harus berupa angka, true, atau false.");
    }
    await adm(sb, "admin_set_setting", { p_key: key, p_value: value });
    setEdits((e) => { const n = { ...e }; delete n[key]; return n; });
    reload();
  };
  return (
    <>
      <p className="caption muted">Ubah dengan hati-hati: nilai ini langsung memengaruhi perhitungan status dan batas pelaporan.</p>
      {error && <p className="form-error">{error}</p>}
      {rows?.map((s) => (
        <div key={s.key} className="adm-row">
          <div className="grow">
            <strong>{s.key}</strong>
            <div className="caption muted">{s.description}</div>
          </div>
          <div className="adm-actions">
            <input
              className="adm-set"
              value={edits[s.key] ?? JSON.stringify(s.value)}
              onChange={(e) => setEdits((x) => ({ ...x, [s.key]: e.target.value }))}
              aria-label={s.key}
            />
            {edits[s.key] != null && <button type="button" className="btn btn-primary" onClick={() => save(s.key)}>Simpan</button>}
          </div>
        </div>
      ))}
    </>
  );
}
