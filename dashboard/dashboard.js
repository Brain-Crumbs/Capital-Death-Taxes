/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — DASHBOARD ENTRY POINT
   ════════════════════════════════════════════════════════════════════════════ */

import { aggregate }        from './aggregator.js';
import { charts }           from './charts.js';
import { renderHealth }     from './tabs/health.js';
import { renderEconomy }    from './tabs/economy.js';
import { renderAssets }     from './tabs/assets.js';
import { renderStress }     from './tabs/stress.js';
import { replayController } from './tabs/replay.js';

// ── Render all tabs ──────────────────────────────────────────────────────────

function renderAll(runs) {
  const agg = aggregate(runs);

  const names = [...new Set(runs.map(r => r.scenarioName))].join(', ');
  const seeds = [...new Set(runs.map(r => r.seed.replace(/-run\d+$/, '')))].join(', ');
  document.getElementById('hdr-scenario').textContent = `Scenario: ${names}`;
  document.getElementById('hdr-runs').textContent     = `${runs.length} run${runs.length === 1 ? '' : 's'}`;
  document.getElementById('hdr-seed').textContent     = `seed: ${seeds}`;

  renderHealth(agg, runs);
  renderEconomy(agg);
  renderAssets(agg);
  renderStress(agg);
  replayController.init(runs);
}

// ── File loading ─────────────────────────────────────────────────────────────

function setDropError(msg) {
  document.getElementById('drop-error').textContent = msg;
}

function loadRuns(text, filename) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    setDropError('Invalid JSON: ' + e.message);
    return;
  }

  if (!Array.isArray(data)) {
    setDropError('Expected a JSON array of run results.');
    return;
  }
  if (!data.length) {
    setDropError('The file contains an empty array.');
    return;
  }

  // Accept both formats:
  //   [{ runIndex, seed, scenarioName, metrics }]  ← scenario-runner output
  //   [{ first_asset_round, ... }]                  ← raw collector output (legacy)
  const runs = data.map((item, i) => {
    if (item.metrics && typeof item.metrics === 'object') return item;
    return { runIndex: i, seed: `unknown-run${i}`, scenarioName: filename || 'unknown', metrics: item };
  });

  document.getElementById('drop-screen').style.display = 'none';
  document.getElementById('dashboard').style.display   = 'flex';
  document.title = 'B&D Dashboard — ' + (runs[0].scenarioName || filename);

  renderAll(runs);
}

// ── Run picker ───────────────────────────────────────────────────────────────

async function populateRunPicker() {
  const sel = document.getElementById('run-select');
  sel.innerHTML = '<option value="">Loading runs…</option>';
  try {
    const r = await fetch('/runs/');
    const { files } = await r.json();
    sel.innerHTML = '';
    if (!files.length) {
      sel.innerHTML = '<option value="">No runs found in output/runs</option>';
      return;
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— select a run —';
    sel.appendChild(placeholder);
    files.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      sel.appendChild(opt);
    });
  } catch {
    sel.innerHTML = '<option value="">Failed to load run list</option>';
  }
}

async function loadSelectedRun() {
  const sel = document.getElementById('run-select');
  const filename = sel.value;
  if (!filename) return;
  setDropError('');
  try {
    const res  = await fetch(`/runs/${encodeURIComponent(filename)}`);
    const text = await res.text();
    loadRuns(text, filename);
  } catch (e) {
    setDropError('Failed to load run: ' + e.message);
  }
}

// ── Initialisation ───────────────────────────────────────────────────────────

function init() {
  document.getElementById('load-btn').addEventListener('click', loadSelectedRun);
  document.getElementById('run-select').addEventListener('change', loadSelectedRun);

  populateRunPicker();

  document.getElementById('reload-btn').addEventListener('click', () => {
    charts.destroyAll();
    document.getElementById('dashboard').style.display   = 'none';
    document.getElementById('drop-screen').style.display = '';
    setDropError('');
    document.title = 'Borrow & Die — Simulator Dashboard';
    populateRunPicker();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');

      // Force chart resize after tab switch (Chart.js needs visible canvas)
      setTimeout(() => { charts.resizeAll(); }, 50);
    });
  });
}

document.addEventListener('DOMContentLoaded', init);
