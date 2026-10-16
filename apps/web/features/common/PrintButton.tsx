"use client";
import { Icon } from "./Icon";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" className="btn btn-primary" onClick={() => window.print()}>
      <Icon name="printer" /> {label}
    </button>
  );
}
