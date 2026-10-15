import type { FuelStatus } from "@wenten/core";

interface Props {
  status: FuelStatus;
  size?: number;
  confirmed?: boolean;
  stale?: boolean;
  label?: string;
}

/** Simbol status yang tidak bergantung warna: ● ◐ ○× ◌ (DESIGN.md bagian 3). */
export function StatusGlyph({ status, size = 16, confirmed, stale, label }: Props) {
  const r = 7;
  if (size >= 18) return <PumpGlyph status={status} size={size} confirmed={confirmed} stale={stale} label={label} />;
  return (
    <svg
      className={`glyph${stale ? " stale" : ""}`}
      width={size}
      height={size}
      viewBox="-10 -10 20 20"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {confirmed && <circle r={9.2} fill="none" stroke="var(--confirm-ring)" strokeWidth={1.4} />}
      {status === "available" && <circle r={r} fill="var(--status-available)" />}
      {status === "limited" && (
        <>
          <circle r={r - 0.75} fill="var(--marker-fill)" stroke="var(--status-available)" strokeWidth={1.5} />
          <path d={`M0,-${r - 0.75} A${r - 0.75},${r - 0.75} 0 0,0 0,${r - 0.75} Z`} fill="var(--status-limited)" />
        </>
      )}
      {status === "empty" && (
        <>
          <circle r={r - 1.25} fill="var(--marker-fill)" stroke="var(--status-empty)" strokeWidth={2.5} />
          <path d="M-2.6,-2.6 L2.6,2.6 M2.6,-2.6 L-2.6,2.6" stroke="var(--status-empty)" strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {status === "unknown" && (
        <circle r={r - 1} fill="var(--marker-fill)" stroke="var(--status-unknown)" strokeWidth={2} strokeDasharray="3 2.2" />
      )}
    </svg>
  );
}

const COLOR = {
  available: "var(--status-available)",
  limited: "var(--status-limited)",
  empty: "var(--status-empty)",
  unknown: "var(--status-unknown)",
} as const;

/** Ikon pompa SPBU dalam lingkaran status, sama dengan penanda peta. */
function PumpGlyph({ status, size, confirmed, stale, label }: Props & { size: number }) {
  const c = COLOR[status];
  const stroke = status === "unknown" ? c : "#fff";
  return (
    <svg
      className={`glyph${stale ? " stale" : ""}`}
      width={size}
      height={size}
      viewBox="-16 -16 32 32"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {confirmed && <circle r={15} fill="none" stroke="var(--confirm-ring)" strokeWidth={2} />}
      {status === "unknown" ? (
        <circle r={11.5} fill="var(--marker-fill)" stroke={c} strokeWidth={2} strokeDasharray="4 3" />
      ) : (
        <circle r={12} fill={c} stroke="var(--marker-fill)" strokeWidth={2} />
      )}
      <g fill="none" stroke={stroke} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" transform="translate(-0.5 0) scale(0.78)">
        <path d="M-6,8.5 V-7 a2,2 0 0 1 2,-2 h6 a2,2 0 0 1 2,2 V8.5 M-7.5,8.5 H5.5" />
        <path d="M-4,-4.5 H3" />
        <path d="M7.5,-2 h1 a1.6,1.6 0 0 1 1.6,1.6 V5 a1.5,1.5 0 0 0 3,0 V-3.5 L10.2,-6" />
      </g>
      {status === "empty" && (
        <>
          <circle cx={8.5} cy={8.5} r={5} fill="#fff" stroke={c} strokeWidth={1.5} />
          <path d="M6.2,6.2 L10.8,10.8 M10.8,6.2 L6.2,10.8" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {status === "limited" && (
        <>
          <circle cx={8.5} cy={8.5} r={5} fill="#fff" stroke={c} strokeWidth={1.5} />
          <path d="M8.5,4.2 A4.3,4.3 0 0 0 8.5,12.8 Z" fill={c} />
        </>
      )}
    </svg>
  );
}
