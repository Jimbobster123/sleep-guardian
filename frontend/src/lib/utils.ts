import { clsx, type ClassValue } from "clsx";
import type { WheelEvent } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stops wheel/trackpad from changing `type="number"` while scrolling a parent (e.g. modal). */
export function blurNumberInputOnWheel(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

export function formatMinutesShort(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (mins < 60) return `${mins} m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}
