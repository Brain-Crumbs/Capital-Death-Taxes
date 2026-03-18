/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — SHARED CONSTANTS & COLOUR HELPERS
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Industry colours ─────────────────────────────────────────────────────────

export const INDUSTRY_COLORS = {
  TECHNOLOGY:          '#4fc3f7',
  ENERGY:              '#ffb74d',
  REAL_ESTATE:         '#a5d6a7',
  FINANCE:             '#ce93d8',
  MANUFACTURING:       '#80cbc4',
  MEDIA:               '#f48fb1',
  MEDIA_ENTERTAINMENT: '#f48fb1',
  HYBRID:              '#ffe082',
};

// Colour for an industry (normalises MEDIA → MEDIA_ENTERTAINMENT etc.)
export function industryColor(ind) {
  return INDUSTRY_COLORS[ind] || INDUSTRY_COLORS[(ind || '').replace('-', '_').toUpperCase()] || '#888';
}

// ── Health thresholds ────────────────────────────────────────────────────────
// green = [lo, hi], amber = [lo, hi] — anything outside amber is red

export const HEALTH_THRESHOLDS = {
  game_length_rounds:          { green: [8, 12],   amber: [6, 14],  target: '~10',  flag: '<6 or >14' },
  first_asset_round:           { green: [1, 4],    amber: [1, 6],   target: '≤4',   flag: '>6' },
  first_death_roll_round:      { green: [6, 8],    amber: [4, 10],  target: '6–8',  flag: '<4 or >10' },
  death_count:                 { green: [0.7, 1.5], amber: [0.3, 2.5], target: '~1', flag: '0 or >2' },
  bankruptcy_count:            { green: [0.6, 1.5], amber: [0.2, 3.0], target: '~1', flag: '0 or >3' },
  collateral_violation_count:  { green: [1, 3],    amber: [0.5, 6], target: '1–3',  flag: '0 or >6' },
};

export function healthColor(metric, val) {
  if (val === null || val === undefined) return 'card-amber';
  const t = HEALTH_THRESHOLDS[metric];
  if (!t) return 'card-amber';
  if (val >= t.green[0] && val <= t.green[1]) return 'card-green';
  if (val >= t.amber[0] && val <= t.amber[1]) return 'card-amber';
  return 'card-red';
}

const HEALTH_RGBA = {
  'card-green': (a) => `rgba(0,230,118,${a})`,
  'card-amber': (a) => `rgba(255,215,64,${a})`,
  'card-red':   (a) => `rgba(255,23,68,${a})`,
};

export function healthRgba(metric, val, alpha = 0.7) {
  return HEALTH_RGBA[healthColor(metric, val)](alpha);
}

export function stressRgba(stressVal, alpha = 0.7) {
  if (stressVal >= 6 && stressVal <= 8)  return `rgba(0,230,118,${alpha})`;
  if (stressVal >= 4 && stressVal <= 10) return `rgba(255,215,64,${alpha})`;
  return `rgba(255,23,68,${alpha})`;
}
