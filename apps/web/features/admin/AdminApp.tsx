"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REGIONS } from "@wenten/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { IS_DEMO } from "@/lib/env";
import { getSupabase } from "@/lib/supabase/client";
import { Icon } from "../common/Icon";
import { Logo } from "../common/Logo";
import { runTurnstile } from "../session/turnstile";

type Json = Record<string, unknown>;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Tone = "ok" | "warn" | "bad" | "info" | "muted";
type Tab = "ringkasan" | "laporan" | "tempat" | "koreksi" | "pengumuman" | "pengaturan";
type Auth = "loading" | "out" | "denied" | "admin";

interface Ctx {
  sb: SupabaseClient;
  notify(text: string, tone?: "ok" | "bad"): void;
  /** Muat ulang angka ringkasan (lencana tab). */
  refresh(): void;
}

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
const wita = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

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
  useEffect(() => {
    setRows(null);
    reload();
  }, [reload]);
  return { rows, error, reload };
}

/* ───────────────────────── Kerangka ───────────────────────── */

export function AdminApp() {
  const [sb, setSb] = useState<SupabaseClient | null>(null);
  const [auth, setAuth] = useState<Auth>("loading");
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [overview, setOverview] = useState<Row | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const notify = useCallback((text: string, tone: "ok" | "bad" = "ok") => {
    setToast({ text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(() => {
    if (!sb) return;
    adm(sb, "admin_overview").then(setOverview).catch(() => {});
  }, [sb]);
  useEffect(() => {
    if (auth === "admin") refresh();
  }, [auth, refresh]);

  const signOut = async () => {
    await sb?.auth.signOut();
    setAuth("out");
  };

  if (IS_DEMO) return <Frame><Notice tone="warn">Panel admin hanya tersedia saat Supabase terhubung.</Notice></Frame>;
  if (auth === "loading" || !sb) return <Frame><p className="muted">Memuat…</p></Frame>;
  if (auth === "out") return <Login sb={sb} onDone={() => check(sb)} />;
  if (auth === "denied") {
    return (
      <Frame right={<button type="button" className="btn" onClick={signOut}>Keluar</button>}>
        <Notice tone="warn">
          Akun ini bukan admin. Beri peran admin lewat SQL Editor Supabase (lihat OPERATIONS.md), lalu muat ulang halaman.
        </Notice>
      </Frame>
    );
  }

  const ctx: Ctx = { sb, notify, refresh };
  const count = (n: unknown) => (typeof n === "number" ? n : 0);
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "ringkasan", label: "Ringkasan" },
    { key: "laporan", label: "Laporan", badge: count(overview?.reports_flagged) + count(overview?.reports_quarantined) },
    { key: "tempat", label: "Tempat", badge: count(overview?.places_pending) },
    { key: "koreksi", label: "Koreksi", badge: count(overview?.corrections_pending) },
    { key: "pengumuman", label: "Pengumuman" },
    { key: "pengaturan", label: "Pengaturan" },
  ];

  return (
    <Frame right={<button type="button" className="btn" onClick={signOut}>Keluar</button>}>
      <nav className="adm-tabs" aria-label="Bagian admin">
        {tabs.map((t) => (
          <button key={t.key} type="button" className="adm-tab" aria-current={tab === t.key ? "page" : undefined} onClick={() => setTab(t.key)}>
            {t.label}
            {!!t.badge && <span className="adm-count">{t.badge}</span>}
          </button>
        ))}
      </nav>
      {tab === "ringkasan" && <Overview ctx={ctx} overview={overview} go={setTab} />}
      {tab === "laporan" && <Reports ctx={ctx} />}
      {tab === "tempat" && <Places ctx={ctx} />}
      {tab === "koreksi" && <Corrections ctx={ctx} />}
      {tab === "pengumuman" && <Announcements ctx={ctx} />}
      {tab === "pengaturan" && <Settings ctx={ctx} />}
      {toast && (
        <div className={`adm-toast ${toast.tone}`} role="status">
          <Icon name={toast.tone === "ok" ? "check" : "alert"} size={16} /> {toast.text}
        </div>
      )}
    </Frame>
  );
}

function Frame({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="adm">
      <header className="adm-bar">
        <div className="adm-bar-in">
          <Logo size={26} />
          <span className="adm-pill">Admin</span>
          <span className="grow" />
          {right}
        </div>
      </header>
      <main className="adm-main">{children}</main>
    </div>
  );
}

/* ───────────────────────── Bahan tampilan ───────────────────────── */

function Badge({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`adm-badge ${tone}`}>{children}</span>;
}

function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div className={`adm-notice ${tone}`} role={tone === "bad" ? "alert" : undefined}>
      <Icon name={tone === "info" ? "info" : "alert"} size={16} />
      <div>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="adm-empty">{children}</div>;
}

function Filters({ value, onChange, options }: { value: string; onChange(v: string): void; options: [string, string][] }) {
  return (
    <div className="adm-filters" role="tablist">
      {options.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className="adm-filter" onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange(): void; label: string }) {
  return (
    <span className="adm-switch-wrap">
      <span className={`adm-switch-state ${on ? "on" : "off"}`} aria-hidden="true">{on ? "ON" : "OFF"}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="adm-switch" onClick={onChange}><span /></button>
    </span>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="adm-section">
      <h2>{title}</h2>
      {hint && <p className="adm-hint">{hint}</p>}
      {children}
    </section>
  );
}

function ListState({ rows, error, empty }: { rows: Row[] | null; error: string | null; empty: string }) {
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (rows === null) return <p className="muted">Memuat…</p>;
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return null;
}

/* ───────────────────────── Masuk ───────────────────────── */

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
            <input type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
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

/* ───────────────────────── Ringkasan ───────────────────────── */

function Overview({ ctx, overview: d, go }: { ctx: Ctx; overview: Row | null; go(t: Tab): void }) {
  const { sb, notify, refresh } = ctx;
  const [geofence, setGeofence] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    adm(sb, "admin_list_settings")
      .then((s) => {
        const row = (s.rows as Row[]).find((x) => x.key === "geofence_enabled");
        setGeofence(row ? row.value === true : null);
      })
      .catch(() => setGeofence(null));
  }, [sb]);

  if (!d) return <p className="muted">Memuat…</p>;
  const n = (v: unknown) => (typeof v === "number" ? v : 0);

  const attention: { label: string; value: number; tab: Tab }[] = [
    { label: "Laporan ditandai warga", value: n(d.reports_flagged), tab: "laporan" },
    { label: "Laporan dikarantina", value: n(d.reports_quarantined), tab: "laporan" },
    { label: "Tempat menunggu tinjauan", value: n(d.places_pending), tab: "tempat" },
    { label: "Koreksi menunggu", value: n(d.corrections_pending), tab: "koreksi" },
  ];
  const activity: [string, number][] = [
    ["Laporan 24 jam", n(d.reports_24h)],
    ["Tempat usulan warga", n(d.places_by_users)],
    ["Pelanggaran 24 jam", n(d.abuse_24h)],
    ["Perangkat diblokir", n(d.profiles_blocked)],
  ];

  const setSetting = async (key: string, value: boolean, ask: string, done: string) => {
    if (!window.confirm(ask)) return;
    try {
      await adm(sb, "admin_set_setting", { p_key: key, p_value: value });
      notify(done);
      refresh();
      if (key === "geofence_enabled") setGeofence(value);
    } catch (e) {
      notify(String((e as Error).message), "bad");
    }
  };

  return (
    <>
      <Section title="Perlu perhatian">
        <div className="adm-stats">
          {attention.map((a) => (
            <button key={a.label} type="button" className={`adm-stat${a.value > 0 ? " attn" : ""}`} onClick={() => go(a.tab)}>
              <span className="adm-stat-n">{a.value}</span>
              <span className="adm-stat-l">{a.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Aktivitas">
        <div className="adm-stats">
          {activity.map(([label, v]) => (
            <div key={label} className="adm-stat">
              <span className="adm-stat-n">{v}</span>
              <span className="adm-stat-l">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Kontrol">
        <div className="adm-card">
          <div className="adm-switch-row">
            <div>
              <strong>Pelaporan warga</strong>
              <p className="adm-hint">ON: warga bisa mengirim laporan. OFF: mode baca-saja, peta tetap tampil tetapi laporan dihentikan. Pakai OFF saat ada serangan spam.</p>
            </div>
            <Switch
              on={!d.read_only}
              label="Pelaporan warga"
              onChange={() =>
                setSetting("read_only", !d.read_only, d.read_only ? "Buka kembali pelaporan?" : "Hentikan sementara semua pelaporan?", d.read_only ? "Pelaporan dibuka." : "Pelaporan dihentikan.")
              }
            />
          </div>
          <div className="adm-switch-row">
            <div>
              <strong>Syarat radius 300 m</strong>
              <p className="adm-hint">
                {geofence === null
                  ? "Belum tersedia: jalankan migrasi 0018."
                  : "ON: hanya yang berada dalam radius 300 m dari SPBU yang bisa melapor. OFF: bisa melapor dari mana saja (berguna di awal peluncuran, tetapi laporan lebih mudah dipalsukan)."}
              </p>
            </div>
            {geofence != null && (
              <Switch
                on={geofence}
                label="Syarat radius 300 meter"
                onChange={() =>
                  setSetting(
                    "geofence_enabled",
                    !geofence,
                    geofence ? "Matikan syarat radius? Warga bisa melapor dari mana saja, sehingga laporan lebih mudah dipalsukan." : "Wajibkan pelapor berada dalam radius 300 m dari SPBU?",
                    geofence ? "Syarat radius dimatikan." : "Syarat radius diaktifkan.",
                  )
                }
              />
            )}
          </div>
        </div>
      </Section>
    </>
  );
}

/* ───────────────────────── Laporan ───────────────────────── */

const AVAIL: Record<string, [string, Tone]> = { available: ["Tersedia", "ok"], limited: ["Terbatas", "warn"], empty: ["Habis", "bad"] };
const STATUS_TONE: Record<string, [string, Tone]> = {
  active: ["Aktif", "ok"],
  quarantined: ["Dikarantina", "warn"],
  hidden: ["Disembunyikan", "muted"],
};
const QUEUE_LABEL: Record<string, string> = { none: "tidak antre", short: "antre pendek", medium: "antre sedang", long: "antre panjang" };

function Reports({ ctx }: { ctx: Ctx }) {
  const { sb, notify, refresh } = ctx;
  const [filter, setFilter] = useState("flagged");
  const { rows, error, reload } = useLoad(sb, "admin_moderation_queue", { p_filter: filter, p_limit: 100 });
  const [fuels, setFuels] = useState<Record<number, string>>({});
  useEffect(() => {
    sb.from("fuel_types").select("id,name").then(({ data }) => setFuels(Object.fromEntries((data ?? []).map((f) => [f.id, f.name]))));
  }, [sb]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      notify(ok);
      reload();
      refresh();
    } catch (e) {
      notify(String((e as Error).message), "bad");
    }
  };
  const setStatus = (id: string, status: "hidden" | "active") =>
    run(() => adm(sb, "admin_set_report_status", { p_ids: [id], p_status: status, p_note: null }), status === "hidden" ? "Laporan disembunyikan." : "Laporan dipulihkan.");
  const block = (r: Row) => {
    const reason = window.prompt(`Blokir ${r.pseudonym}? Semua laporannya 24 jam terakhir ikut disembunyikan. Tulis alasan singkat:`);
    if (!reason) return;
    void run(() => adm(sb, "admin_block_profile", { p_profile: r.reporter_id, p_block: true, p_reason: reason, p_hide_recent: true }), "Pelapor diblokir.");
  };

  return (
    <>
      <Filters
        value={filter}
        onChange={setFilter}
        options={[["flagged", "Ditandai warga"], ["quarantined", "Dikarantina"], ["hidden", "Disembunyikan"], ["recent", "24 jam terakhir"]]}
      />
      <ListState rows={rows} error={error} empty="Tidak ada laporan di kategori ini." />
      <div className="adm-list">
        {rows?.map((r) => {
          const [stLabel, stTone] = STATUS_TONE[r.moderation_status] ?? [r.moderation_status, "muted" as Tone];
          return (
            <article key={r.id} className="adm-item">
              <div className="adm-item-head">
                <strong>{r.station_name}</strong>
                <Badge tone={stTone}>{stLabel}</Badge>
                <span className="adm-meta">{wita(r.created_at)}</span>
              </div>
              <div className="adm-chips">
                {(r.items as [number, string][] | null)?.map(([f, a]) => {
                  const [label, tone] = AVAIL[a] ?? [a, "muted" as Tone];
                  return <Badge key={f} tone={tone}>{fuels[f] ?? f}: {label}</Badge>;
                })}
                {r.queue_level && <Badge>{QUEUE_LABEL[r.queue_level] ?? r.queue_level}</Badge>}
                {r.wait_minutes != null && <Badge>{r.wait_minutes} mnt</Badge>}
              </div>
              {r.note && <p className="adm-quote">“{r.note}”</p>}
              <p className="adm-meta">
                {r.pseudonym}
                {r.is_blocked ? " (diblokir)" : ""} · {r.report_count} laporan, {r.disputed_count} disanggah · jarak {r.distance_m} m · akurasi {Math.round(r.accuracy_m)} m · setuju {r.confirms}, sanggah {r.disputes}
                {r.quarantine_reason ? ` · alasan karantina: ${r.quarantine_reason}` : ""}
              </p>
              <div className="adm-actions">
                {r.moderation_status === "active" ? (
                  <button type="button" className="btn" onClick={() => setStatus(r.id, "hidden")}>Sembunyikan</button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => setStatus(r.id, "active")}>Pulihkan</button>
                )}
                {!r.is_blocked && <button type="button" className="btn btn-danger" onClick={() => block(r)}>Blokir pelapor</button>}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

/* ───────────────────────── Tempat ───────────────────────── */

const KIND_NAME: Record<string, string> = { spbu: "SPBU", pertashop: "Pertashop", retailer: "Pertamini", terminal: "Terminal" };

function Places({ ctx }: { ctx: Ctx }) {
  const { sb, notify, refresh } = ctx;
  const [filter, setFilter] = useState("quarantined");
  const { rows, error, reload } = useLoad(sb, "admin_list_places", { p_filter: filter, p_limit: 100 });
  const patch = async (id: string, p: Json, ok: string) => {
    try {
      await adm(sb, "admin_update_station", { p_id: id, p_patch: p });
      notify(ok);
      reload();
      refresh();
    } catch (e) {
      notify(String((e as Error).message), "bad");
    }
  };
  return (
    <>
      <Filters value={filter} onChange={setFilter} options={[["quarantined", "Menunggu tinjauan"], ["user", "Semua usulan warga"], ["hidden", "Disembunyikan"]]} />
      <ListState rows={rows} error={error} empty="Tidak ada tempat di kategori ini." />
      <div className="adm-list">
        {rows?.map((p) => (
          <article key={p.id} className="adm-item">
            <div className="adm-item-head">
              <strong>{p.name}</strong>
              <Badge tone="info">{KIND_NAME[p.kind] ?? p.kind}</Badge>
              {p.moderation_status === "quarantined" && <Badge tone="warn">Menunggu</Badge>}
              {p.moderation_status === "approved" && p.is_active && <Badge tone="ok">Tayang</Badge>}
              {!p.is_active && <Badge tone="muted">Nonaktif</Badge>}
            </div>
            <p className="adm-meta">
              {p.address ?? "Tanpa alamat"} · diusulkan {p.pseudonym ?? "OSM"} · {wita(p.created_at)}
            </p>
            <p className="adm-meta">
              <a href={mapsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">
                <Icon name="pin" size={13} /> Lihat di peta ({p.lat}, {p.lng})
              </a>
            </p>
            <div className="adm-actions">
              <button type="button" className="btn btn-primary" onClick={() => patch(p.id, { moderation_status: "approved", is_active: true }, "Tempat disetujui.")}>Setujui</button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const name = window.prompt("Nama baru", p.name);
                  if (name) void patch(p.id, { name }, "Nama diubah.");
                }}
              >
                Ubah nama
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => window.confirm(`Tolak dan sembunyikan ${p.name}?`) && patch(p.id, { moderation_status: "rejected", is_active: false }, "Tempat ditolak.")}
              >
                Tolak
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── Koreksi ───────────────────────── */

const KIND_LABEL: Record<string, string> = {
  wrong_location: "Lokasi salah",
  closed: "Sudah tutup",
  wrong_fuels: "BBM tidak sesuai",
  duplicate: "Data ganda",
  other: "Lainnya",
};

function Corrections({ ctx }: { ctx: Ctx }) {
  const { sb, notify, refresh } = ctx;
  const { rows, error, reload } = useLoad(sb, "admin_list_corrections", { p_status: "pending", p_limit: 100 });
  const resolve = async (id: string, status: "approved" | "rejected") => {
    try {
      await adm(sb, "admin_resolve_correction", { p_id: id, p_status: status });
      notify(status === "approved" ? "Koreksi disetujui." : "Koreksi ditolak.");
      reload();
      refresh();
    } catch (e) {
      notify(String((e as Error).message), "bad");
    }
  };
  return (
    <>
      <Notice>
        Menyetujui koreksi lokasi langsung memindahkan titik, dan menyetujui "sudah tutup" menyembunyikan tempat. Jenis lain hanya ditandai selesai: ubah datanya lewat tab Tempat.
      </Notice>
      <ListState rows={rows} error={error} empty="Tidak ada koreksi yang menunggu." />
      <div className="adm-list">
        {rows?.map((c) => (
          <article key={c.id} className="adm-item">
            <div className="adm-item-head">
              <strong>{c.station_name}</strong>
              <Badge tone="info">{KIND_LABEL[c.kind] ?? c.kind}</Badge>
              <span className="adm-meta">{wita(c.created_at)}</span>
            </div>
            {c.note && <p className="adm-quote">“{c.note}”</p>}
            <p className="adm-meta">
              {c.pseudonym} · titik saat ini:{" "}
              <a href={mapsUrl(c.lat, c.lng)} target="_blank" rel="noopener noreferrer">{c.lat}, {c.lng}</a>
              {c.proposed_lat != null && (
                <>
                  {" "}· usulan:{" "}
                  <a href={mapsUrl(c.proposed_lat, c.proposed_lng)} target="_blank" rel="noopener noreferrer">{c.proposed_lat}, {c.proposed_lng}</a>{" "}
                  (geser {c.moved_m} m)
                </>
              )}
            </p>
            <div className="adm-actions">
              <button type="button" className="btn btn-primary" onClick={() => resolve(c.id, "approved")}>Setujui</button>
              <button type="button" className="btn" onClick={() => resolve(c.id, "rejected")}>Tolak</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

/* ───────────────────────── Pengumuman ───────────────────────── */

function Announcements({ ctx }: { ctx: Ctx }) {
  const { sb, notify } = ctx;
  const { rows, error, reload } = useLoad(sb, "admin_list_announcements");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState("info");
  const [hours, setHours] = useState("6");
  const [region, setRegion] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adm(sb, "admin_upsert_announcement", {
        p: { title, body, level, region_id: region, ends_at: new Date(Date.now() + Number(hours) * 3600_000).toISOString() },
      });
      setTitle("");
      setBody("");
      notify("Pengumuman diterbitkan.");
      reload();
    } catch (err) {
      notify(String((err as Error).message), "bad");
    } finally {
      setBusy(false);
    }
  };
  const del = async (id: string) => {
    if (!window.confirm("Hapus pengumuman ini?")) return;
    try {
      await adm(sb, "admin_delete_announcement", { p_id: id });
      notify("Pengumuman dihapus.");
      reload();
    } catch (e) {
      notify(String((e as Error).message), "bad");
    }
  };
  const now = Date.now();
  return (
    <>
      <Section title="Pengumuman baru" hint="Tampil sebagai spanduk di atas peta selama jam tayang yang dipilih.">
        <form className="adm-card adm-form" onSubmit={save}>
          <label className="adm-label">Judul
            <input required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="adm-label">Isi
            <textarea required rows={3} maxLength={300} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="adm-grid3">
            <label className="adm-label">Tingkat
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="info">Info</option>
                <option value="important">Penting</option>
              </select>
            </label>
            <label className="adm-label">Tayang (jam)
              <input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(e.target.value)} />
            </label>
            <label className="adm-label">Wilayah
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">Seluruh Bali</option>
                {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Menerbitkan…" : "Terbitkan"}</button>
        </form>
      </Section>
      <Section title="Riwayat">
        <ListState rows={rows} error={error} empty="Belum ada pengumuman." />
        <div className="adm-list">
          {rows?.map((a) => {
            const live = new Date(a.ends_at).getTime() > now && new Date(a.starts_at).getTime() <= now;
            return (
              <article key={a.id} className="adm-item">
                <div className="adm-item-head">
                  <strong>{a.title}</strong>
                  <Badge tone={a.level === "important" ? "warn" : "info"}>{a.level === "important" ? "Penting" : "Info"}</Badge>
                  <Badge tone={live ? "ok" : "muted"}>{live ? "Tayang" : "Selesai"}</Badge>
                </div>
                <p>{a.body}</p>
                <p className="adm-meta">Sampai {wita(a.ends_at)}</p>
                <div className="adm-actions">
                  <button type="button" className="btn btn-danger" onClick={() => del(a.id)}>Hapus</button>
                </div>
              </article>
            );
          })}
        </div>
      </Section>
    </>
  );
}

/* ───────────────────────── Pengaturan ───────────────────────── */

// Kode BBM Pertamina yang punya harga resmi, berurutan seperti di aplikasi
const OFFICIAL_FUELS: [string, string][] = [
  ["pertalite", "Pertalite"],
  ["pertamax", "Pertamax"],
  ["pertamax_turbo", "Pertamax Turbo"],
  ["biosolar", "Solar (Biosolar)"],
  ["dexlite", "Dexlite"],
  ["pertamina_dex", "Pertamina Dex"],
];

/** Harga resmi Pertamina (acuan di detail SPBU). Diperbarui admin saat harga berganti, biasanya tiap awal bulan. */
function OfficialPrices({ ctx, rows, onSaved }: { ctx: Ctx; rows: Row[] | null; onSaved(): void }) {
  const { sb, notify } = ctx;
  const current = rows?.find((r) => r.key === "official_prices")?.value as { asOf?: string; prices?: Record<string, number> } | undefined;
  const [asOf, setAsOf] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!current) return;
    setAsOf(current.asOf ?? "");
    setVals(Object.fromEntries(OFFICIAL_FUELS.map(([k]) => [k, current.prices?.[k] != null ? String(current.prices[k]) : ""])));
  }, [current]);
  if (rows && !current) return <Notice tone="warn">Harga resmi belum tersedia: jalankan migrasi 0019.</Notice>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const prices: Record<string, number> = {};
    for (const [k] of OFFICIAL_FUELS) {
      const n = Number((vals[k] ?? "").replace(/\D/g, ""));
      if (n > 0) prices[k] = n;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return notify("Tanggal berlaku harus berformat TTTT-BB-HH, misalnya 2026-11-01.", "bad");
    if (!Object.keys(prices).length) return notify("Isi minimal satu harga.", "bad");
    try {
      await adm(sb, "admin_set_setting", { p_key: "official_prices", p_value: { asOf, prices } });
      notify("Harga resmi disimpan. Tampil di aplikasi dalam beberapa menit.");
      onSaved();
    } catch (err) {
      notify(String((err as Error).message), "bad");
    }
  };
  return (
    <Section title="Harga resmi Pertamina" hint="Rupiah per liter. Tampil di detail SPBU dan Pertashop sebagai acuan bila belum ada harga dari warga. Pertamini tidak memakainya. Ambil dari pengumuman resmi Pertamina.">
      <form className="adm-card adm-form" onSubmit={save}>
        <label className="adm-label">Berlaku sejak
          <input value={asOf} placeholder="2026-10-01" inputMode="numeric" onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <div className="adm-grid3">
          {OFFICIAL_FUELS.map(([k, label]) => (
            <label key={k} className="adm-label">{label}
              <span className="adm-money">
                <span aria-hidden="true">Rp</span>
                <input inputMode="numeric" value={vals[k] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value.replace(/\D/g, "") }))} />
              </span>
            </label>
          ))}
        </div>
        <button className="btn btn-primary">Simpan harga resmi</button>
      </form>
    </Section>
  );
}

function Settings({ ctx }: { ctx: Ctx }) {
  const { sb, notify } = ctx;
  const { rows, error, reload } = useLoad(sb, "admin_list_settings");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const save = async (key: string) => {
    let value: unknown;
    try {
      value = JSON.parse(edits[key]!);
    } catch {
      return notify("Nilai harus berupa angka, true, atau false.", "bad");
    }
    try {
      await adm(sb, "admin_set_setting", { p_key: key, p_value: value });
      setEdits((e) => {
        const n = { ...e };
        delete n[key];
        return n;
      });
      notify("Pengaturan disimpan.");
      reload();
    } catch (e) {
      notify(String((e as Error).message), "bad");
    }
  };
  const other = rows?.filter((s) => s.key !== "official_prices" && s.key !== "read_only" && s.key !== "geofence_enabled");
  return (
    <>
      <OfficialPrices ctx={ctx} rows={rows} onSaved={reload} />
      <Section title="Pengaturan lanjutan" hint="Nilai ini langsung memengaruhi perhitungan status dan batas pelaporan. Ubah dengan hati-hati.">
        {error && <Notice tone="bad">{error}</Notice>}
        {rows === null && !error && <p className="muted">Memuat…</p>}
        <div className="adm-card adm-settings">
          {other?.map((s) => (
            <div key={s.key} className="adm-setting">
              <div className="grow">
                <code>{s.key}</code>
                <p className="adm-hint">{s.description}</p>
              </div>
              {typeof s.value === "boolean" ? (
                <Switch
                  on={s.value}
                  label={s.key}
                  onChange={async () => {
                    if (!window.confirm(`${s.value ? "Matikan" : "Aktifkan"} ${s.key}?`)) return;
                    try {
                      await adm(sb, "admin_set_setting", { p_key: s.key, p_value: !s.value });
                      notify("Pengaturan disimpan.");
                      reload();
                    } catch (e) {
                      notify(String((e as Error).message), "bad");
                    }
                  }}
                />
              ) : (
              <div className="adm-setting-edit">
                <input
                  value={edits[s.key] ?? JSON.stringify(s.value)}
                  onChange={(e) => setEdits((x) => ({ ...x, [s.key]: e.target.value }))}
                  aria-label={s.key}
                />
                {edits[s.key] != null && (
                  <button type="button" className="btn btn-primary" onClick={() => save(s.key)}>Simpan</button>
                )}
              </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
