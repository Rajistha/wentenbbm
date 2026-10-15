"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../common/Icon";

interface PhotoData {
  url: string | null;
  source: "google" | "mapillary" | null;
  credit: string | null;
  creditUrl: string | null;
}

function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

/**
 * Foto SPBU dari Google Maps (Places API), dimuat saat terlihat saja.
 * Tanpa foto atau tanpa kunci API, tampil placeholder ikon pompa.
 */
export function StationPhoto({ slug, name, variant }: { slug: string; name: string; variant: "thumb" | "banner" }) {
  const { ref, seen } = useInView();
  const [broken, setBroken] = useState(false);
  const { data } = useQuery({
    queryKey: ["photo", slug],
    enabled: seen,
    staleTime: 6 * 3600_000,
    retry: 0,
    queryFn: async (): Promise<PhotoData> => {
      const res = await fetch(`/api/photo/${slug}`);
      return res.ok ? res.json() : { url: null, source: null, credit: null, creditUrl: null };
    },
  });
  const url = !broken ? data?.url : null;

  return (
    <div ref={ref} className={`photo photo-${variant}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        <span className="photo-ph" aria-hidden="true">
          <Icon name="fuel" size={variant === "banner" ? 40 : 26} />
        </span>
      )}
      {url && data && (
        <a
          className="photo-credit"
          href={data.creditUrl ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {variant === "banner" ? data.credit : data.source === "mapillary" ? "Mapillary" : "Google Maps"}
        </a>
      )}
    </div>
  );
}
