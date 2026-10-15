/** Tanda logo: tetesan BBM dengan titik lokasi di dalamnya, di kotak biru membulat. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="wenten-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#wenten-g)" />
      <path
        d="M16 5.6c-.4.5-7 7.9-7 12.3a7 7 0 0 0 14 0c0-4.4-6.6-11.8-7-12.3Z"
        fill="#fff"
      />
      <circle cx="16" cy="17.9" r="2.7" fill="#2563eb" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" aria-label="Wenten BBM">
      <LogoMark size={size} />
      <span className="logo-word" aria-hidden="true">
        Wenten<span>BBM</span>
      </span>
    </span>
  );
}
