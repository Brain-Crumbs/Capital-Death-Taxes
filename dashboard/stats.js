/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — STATISTICAL HELPERS
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

export function mean(arr) {
  const a = arr.filter(v => v != null && !isNaN(v));
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
}

export function stddev(arr) {
  const a = arr.filter(v => v != null && !isNaN(v));
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

export function percentile(arr, p) {
  const a = arr.filter(v => v != null && !isNaN(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const idx = p / 100 * (a.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] * (1 - (idx - lo)) + a[hi] * (idx - lo);
}

export function median(arr) { return percentile(arr, 50); }
