"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useIsDesktop } from "./useMedia";

export type Snap = "half" | "full";

interface Props {
  label: string;
  initial?: Snap;
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  onClose(): void;
  /** Di desktop tampil sebagai laci kanan 400 px. */
  drawerOnDesktop?: boolean;
  onSnapChange?(s: Snap): void;
  scrim?: boolean;
}

const HEIGHT: Record<Snap, string> = { half: "55dvh", full: "92dvh" };
const CLOSE_PX = 80;
const EXPAND_PX = 60;
const INTERACTIVE = "button, a, input, select, textarea, label, [role=radio], [role=checkbox]";

/**
 * Bottom sheet dua titik henti (55% dan 92%). Bisa digeser ke bawah untuk menutup dari
 * gagang, header, maupun isi (selama isi sedang di posisi paling atas), dan ke atas untuk memperbesar.
 */
export function BottomSheet({ label, initial = "half", header, footer, children, onClose, drawerOnDesktop = true, onSnapChange, scrim }: Props) {
  const [snap, setSnap] = useState<Snap>(initial);
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const moved = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const asDrawer = drawerOnDesktop && isDesktop;

  useEffect(() => setSnap(initial), [initial]);
  useEffect(() => onSnapChange?.(snap), [snap, onSnapChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Kunci fokus saat posisi penuh (DESIGN.md 11)
  useEffect(() => {
    if (snap !== "full" || asDrawer) return;
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = el.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [snap, asDrawer]);

  const begin = (y: number) => {
    startY.current = y;
    moved.current = false;
  };
  const move = (y: number) => {
    if (startY.current == null) return;
    const dy = y - startY.current;
    if (Math.abs(dy) > 6) moved.current = true;
    setDragY(dy);
  };
  const end = () => {
    if (startY.current == null) return;
    const dy = dragY;
    startY.current = null;
    setDragY(0);
    if (dy > CLOSE_PX) {
      if (snap === "full") setSnap("half");
      else onClose();
    } else if (dy < -EXPAND_PX && snap === "half") {
      setSnap("full");
    }
  };

  // Gagang dan header: pointer events (abaikan bila yang disentuh tombol atau input)
  const dragZone = asDrawer
    ? {}
    : {
        onPointerDown: (e: React.PointerEvent) => {
          const t = e.target as HTMLElement;
          if (t.closest(INTERACTIVE) && !t.closest(".sheet-handle")) return;
          begin(e.clientY);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        },
        onPointerMove: (e: React.PointerEvent) => move(e.clientY),
        onPointerUp: end,
        onPointerCancel: end,
      };

  // Isi: hanya saat sudah di paling atas, supaya tidak bentrok dengan gulir
  const bodyTouch = asDrawer
    ? {}
    : {
        onTouchStart: (e: React.TouchEvent) => {
          if ((bodyRef.current?.scrollTop ?? 0) <= 0) begin(e.touches[0]!.clientY);
        },
        onTouchMove: (e: React.TouchEvent) => {
          if (startY.current == null) return;
          const dy = e.touches[0]!.clientY - startY.current;
          // dorong ke atas = biarkan gulir biasa
          if (dy < 0 && !moved.current) {
            startY.current = null;
            return;
          }
          if ((bodyRef.current?.scrollTop ?? 0) > 0 && !moved.current) {
            startY.current = null;
            return;
          }
          move(e.touches[0]!.clientY);
        },
        onTouchEnd: end,
        onTouchCancel: end,
      };

  return (
    <>
      <div
        ref={ref}
        className={`sheet${asDrawer ? " as-drawer" : ""}`}
        role="dialog"
        aria-modal={snap === "full" && !asDrawer}
        aria-label={label}
        style={{
          height: asDrawer ? undefined : `calc(${HEIGHT[snap]} - ${dragY}px)`,
          transition: dragY ? "none" : undefined,
        }}
      >
        <div className="sheet-drag" {...dragZone}>
          <button
            type="button"
            className="sheet-handle"
            aria-label={snap === "half" ? "Perbesar" : "Perkecil"}
            onClick={() => {
              if (!moved.current) setSnap((s) => (s === "half" ? "full" : "half"));
            }}
          />
          {header}
        </div>
        <div ref={bodyRef} className="sheet-body" {...bodyTouch}>
          {children}
        </div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
      {scrim && !asDrawer && snap === "full" && <div className="scrim" onClick={onClose} aria-hidden="true" />}
    </>
  );
}
