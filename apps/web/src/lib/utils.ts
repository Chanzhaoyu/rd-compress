import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSizeDelta(original: number, compressed: number) {
  if (!(original > 0)) return { text: "0%", grew: false };
  const pct = ((original - compressed) / original) * 100;
  if (pct >= 0) return { text: `-${pct.toFixed(1)}%`, grew: false };
  return { text: `+${Math.abs(pct).toFixed(1)}%`, grew: true };
}
