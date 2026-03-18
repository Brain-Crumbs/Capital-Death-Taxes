/* ════════════════════════════════════════════════════════════════════════════
   BORROW & DIE — TAB 5: REPLAY
   ════════════════════════════════════════════════════════════════════════════ */

'use strict';

import { industryColor } from '../constants.js';
import { charts, baseScales, BASE_FONT, TICK_COLOR } from '../charts.js';

class ReplayController {
  #runs              = [];
  #runIdx            = 0;
  #round             = 1;
  #listenersAttached = false;

  #populateRunSelect() {
    const sel = document.getElementById('replay-run-select');
    sel.innerHTML = '';
    this.#runs.forEach((r, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `Run ${r.runIndex} — ${r.scenarioName} (${r.metrics.game_length_rounds} rounds)`;
      sel.appendChild(opt);
    });
  }

  #renderRound() {
    const run   = this.#runs[this.#runIdx];
    if (!run) return;
    const m     = run.metrics;
    const round = this.#round;
    const maxRnd = m.game_length_rounds || 1;

    document.getElementById('round-display').textContent = `Round ${round} / ${maxRnd}`;
    document.getElementById('round-slider').value = round;

    // ── GMI ─────────────────────────────────────────────────────────────────
    const gmiByRound = m.gmi_by_round || [];
    const gmi   = gmiByRound[round - 1];
    const gmiEl = document.getElementById('replay-gmi-value');
    if (gmi == null) {
      gmiEl.textContent = '—';
      gmiEl.style.color = '#6c757d';
      document.getElementById('replay-gmi-note').textContent = 'No GMI data for this round';
    } else {
      const arrow = gmi > 0 ? '▲' : gmi < 0 ? '▼' : '—';
      gmiEl.textContent = (gmi > 0 ? '+' : '') + gmi + ' ' + arrow;
      gmiEl.style.color = gmi > 0 ? '#00e676' : gmi < 0 ? '#ff1744' : '#a0a0c0';
      document.getElementById('replay-gmi-note').textContent = 'Global Market Index delta this round';
    }

    // ── Total GMI (cumulative) ───────────────────────────────────────────────
    const gmiTotalEl = document.getElementById('replay-gmi-total');
    const gmiTotal = gmiByRound.slice(0, round).reduce((sum, v) => sum + (v ?? 0), 0);
    const hasAnyGmi = gmiByRound.slice(0, round).some(v => v != null);
    if (!hasAnyGmi) {
      gmiTotalEl.textContent = '—';
      gmiTotalEl.style.color = '#6c757d';
    } else {
      const totalArrow = gmiTotal > 0 ? '▲' : gmiTotal < 0 ? '▼' : '—';
      gmiTotalEl.textContent = (gmiTotal > 0 ? '+' : '') + gmiTotal + ' ' + totalArrow;
      gmiTotalEl.style.color = gmiTotal > 0 ? '#00e676' : gmiTotal < 0 ? '#ff1744' : '#a0a0c0';
    }

    // ── Events ──────────────────────────────────────────────────────────────
    const evList = document.getElementById('replay-event-list');
    evList.innerHTML = '';
    const events = (m.notable_events_by_round ?? {})[round] ?? [];

    if (!events.length) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="muted">No recorded events this round</span>';
      evList.appendChild(li);
    } else {
      for (const ev of events) {
        const li = document.createElement('li');
        li.innerHTML = `<span class="event-tag ${ev.tagClass}">${ev.tag}</span>${ev.text}`;
        evList.appendChild(li);
      }
    }

    // ── Asset values bar chart for this round ──────────────────────────────
    const activeAssets = (m.asset_value_trajectories || [])
      .map(t => ({ id: t.assetId, industry: t.industry, val: (t.valueByRound || [])[round - 1] }))
      .filter(a => a.val != null);

    const assetsEmptyEl = document.getElementById('replay-assets-empty');
    if (assetsEmptyEl) assetsEmptyEl.style.display = activeAssets.length === 0 ? 'block' : 'none';

    charts.make('chart-replay-assets', {
      type: 'bar',
      data: {
        labels: activeAssets.map(a => a.id),
        datasets: [{
          label: 'Asset Value',
          data:  activeAssets.map(a => a.val),
          backgroundColor: activeAssets.map(a => industryColor(a.industry) + 'bb'),
          borderColor:     activeAssets.map(a => industryColor(a.industry)),
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: baseScales(
          { ticks: { color: TICK_COLOR, font: BASE_FONT, maxRotation: 35 } },
          { title: { display: true, text: 'Value ($)', color: TICK_COLOR, font: BASE_FONT } }
        ),
      },
    });
  }

  #renderScores() {
    const run  = this.#runs[this.#runIdx];
    if (!run) return;
    const body = document.getElementById('replay-scores-body');
    body.innerHTML = '';
    const players = [...(run.metrics.final_score_by_player || [])]
      .sort((a, b) => b.score - a.score);

    if (!players.length) {
      body.innerHTML = '<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">No player data</td></tr>';
      return;
    }

    players.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="num">${idx === 0 ? '🏆 ' : ''}${p.playerId}</td>
        <td>${p.ceoArchetype || '—'}</td>
        <td class="num" style="color:${idx === 0 ? '#00e676' : '#e0e0e0'}">${p.score}</td>
        <td class="muted">${(p.industries || []).join(', ') || '—'}</td>
      `;
      body.appendChild(tr);
    });
  }

  #switchRun(idx) {
    const run  = this.#runs[idx];
    if (!run) return;
    this.#runIdx = idx;
    this.#round  = 1;
    const maxRnd = run.metrics.game_length_rounds || 1;
    const slider = document.getElementById('round-slider');
    slider.max   = maxRnd;
    slider.value = 1;
    this.#renderRound();
    this.#renderScores();
  }

  init(runs) {
    this.#runs = runs;
    this.#populateRunSelect();
    this.#switchRun(0);

    if (this.#listenersAttached) return;
    this.#listenersAttached = true;

    document.getElementById('replay-run-select').addEventListener('change', e => {
      this.#switchRun(+e.target.value);
    });

    document.getElementById('round-slider').addEventListener('input', e => {
      this.#round = +e.target.value;
      this.#renderRound();
    });

    document.getElementById('prev-btn').addEventListener('click', () => {
      if (this.#round > 1) { this.#round--; this.#renderRound(); }
    });

    document.getElementById('next-btn').addEventListener('click', () => {
      const maxRnd = this.#runs[this.#runIdx].metrics.game_length_rounds || 1;
      if (this.#round < maxRnd) { this.#round++; this.#renderRound(); }
    });
  }
}

export const replayController = new ReplayController();
