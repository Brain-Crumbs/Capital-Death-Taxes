#!/usr/bin/env node
/**
 * cli/run.js — Borrow & Die scenario runner CLI
 *
 * Usage:
 *   node cli/run.js --scenario default-4p --runs 100 --output output/runs/
 *   node cli/run.js --scenario default-4p --runs 1 --step
 *   node cli/run.js --list-scenarios
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { createInterface }                                      from 'readline';
import { fileURLToPath }                                        from 'url';
import { join, dirname }                                        from 'path';
import { Command }                                              from 'commander';
import { runScenario }                                          from '../scenarios/scenario-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, '../scenarios');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns an ISO-like timestamp string safe for use in filenames.
 * e.g. "20260316-143022"
 */
function fileTimestamp() {
  const now = new Date();
  const pad  = n => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/**
 * Blocks until the user presses Enter.
 * @param {string} [prompt]
 * @returns {Promise<void>}
 */
function waitForEnter(prompt = 'Press Enter to continue...') {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Prints a concise state snapshot to stdout for step mode.
 * @param {object} state
 * @param {object} yearMetrics
 */
function printStateSnapshot(state, yearMetrics) {
  const sep = '─'.repeat(64);
  const gmiStr = state.gmi >= 0 ? `+${state.gmi}` : String(state.gmi);
  const bubbles     = state.activeBubbles.map(b => b.eventName).join(', ')    || '—';
  const depressions = state.activeDepressions.map(d => d.eventName).join(', ')|| '—';

  console.log(`\n${sep}`);
  console.log(`  ROUND ${state.round}  |  GMI: ${gmiStr}`);
  console.log(`  Bubbles: ${bubbles}   Depressions: ${depressions}`);
  console.log(sep);

  for (const p of state.players) {
    const status   = p.alive ? 'alive' : '  DEAD';
    const ceoName  = p.ceo?.ceoName ?? 'no CEO';
    const assetStr = (p.assets ?? [])
      .map(a => `${a.companyName}[$${a.currentValue ?? a.baseValue}]`)
      .join(', ') || '—';
    console.log(
      `  ${p.id} (${ceoName}) | ${status}` +
      ` | cash:$${p.cash} stress:${p.stress} loans:${p.loans}` +
      ` | ${assetStr}`,
    );
  }

  if (state.endTriggered) {
    console.log(`\n${'═'.repeat(64)}`);
    console.log('  GAME OVER');
    const gameOverEvent = [...state.log].reverse().find(e => e.type === 'GAME_OVER');
    if (gameOverEvent?.scores) {
      console.log('  Final scores:');
      for (const [id, s] of Object.entries(gameOverEvent.scores)) {
        console.log(`    ${id}: score=${s.score}  (assets=$${s.assetValue}  taxes=$${s.taxesPaid})`);
      }
    }
    console.log('═'.repeat(64));
  }
}

// ─── List scenarios ───────────────────────────────────────────────────────────

function listScenarios() {
  let files;
  try {
    files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json'));
  } catch {
    console.error(`No scenarios directory found at: ${SCENARIOS_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('No scenario files found.');
    return;
  }

  console.log('Available scenarios:');
  for (const f of files) {
    const name = f.replace(/\.json$/, '');
    let description = '';
    try {
      const cfg = JSON.parse(readFileSync(join(SCENARIOS_DIR, f), 'utf8'));
      const playerSummary = (cfg.players ?? [])
        .map(p => p.agentType)
        .join(', ');
      description = `  runs=${cfg.runs ?? '?'}  players=[${playerSummary}]`;
    } catch {
      // ignore parse errors — just list the name
    }
    console.log(`  ${name}${description}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('run')
  .description('Borrow & Die scenario runner')
  .option('--scenario <name>',  'scenario name to run (without .json extension)')
  .option('--runs <n>',         'number of game runs (overrides scenario default)')
  .option('--output <dir>',     'directory to save run output', 'output/runs/')
  .option('--step',             'step mode: pause and print state between rounds (forces runs=1)')
  .option('--list-scenarios',   'print all available scenario files and exit')
  .parse(process.argv);

const opts = program.opts();

if (opts.listScenarios) {
  listScenarios();
  process.exit(0);
}

if (!opts.scenario) {
  console.error('Error: --scenario <name> is required (or use --list-scenarios)');
  process.exit(1);
}

// ── Load scenario config ──────────────────────────────────────────────────────

const scenarioPath = join(SCENARIOS_DIR, `${opts.scenario}.json`);
let config;
try {
  config = JSON.parse(readFileSync(scenarioPath, 'utf8'));
} catch (err) {
  console.error(`Cannot load scenario "${opts.scenario}": ${err.message}`);
  process.exit(1);
}

// CLI flags override scenario defaults
if (opts.runs !== undefined) {
  config.runs = parseInt(opts.runs, 10);
  if (isNaN(config.runs) || config.runs < 1) {
    console.error('Error: --runs must be a positive integer');
    process.exit(1);
  }
}

if (opts.step) {
  config.runs = 1;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const totalRuns = config.runs ?? 1;
const isStep    = Boolean(opts.step);

console.log(
  `Running scenario "${config.scenarioName}"` +
  `  runs=${totalRuns}  seed=${config.seed}` +
  (isStep ? '  [step mode]' : ''),
);

let completedRuns = 0;

const onYearEnd = isStep
  ? async (state, yearMetrics) => {
      printStateSnapshot(state, yearMetrics);
      if (!state.endTriggered) {
        await waitForEnter('  → Press Enter for next round...');
      }
    }
  : async (_state, _metrics, runIndex) => {
      // Progress feedback for multi-run batches
      completedRuns++;
      if (totalRuns >= 10 && completedRuns % Math.max(1, Math.floor(totalRuns / 10)) === 0) {
        process.stdout.write(`  ${completedRuns}/${totalRuns} runs complete\r`);
      }
    };

let results;
try {
  results = await runScenario(config, { onYearEnd });
} catch (err) {
  console.error(`\nError during scenario run: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}

if (totalRuns >= 10) {
  process.stdout.write('\n');
}

// ── Save output ───────────────────────────────────────────────────────────────

if (!isStep) {
  const outputDir = opts.output;
  const timestamp = fileTimestamp();
  const filename  = `${config.scenarioName}-${timestamp}-${config.seed}.json`;
  const outputPath = join(outputDir, filename);

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nSaved ${results.length} run(s) → ${outputPath}`);
  } catch (err) {
    console.error(`\nFailed to save output: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log('\nStep-mode run complete. Output not saved (use without --step to save).');
}
