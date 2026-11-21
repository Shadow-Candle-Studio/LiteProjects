/**
 * Can the whole pipeline run in an n8n Code node with no Python?
 *
 * Proves it by running art-core.js over a real PNG using only Node built-ins,
 * then comparing the verdict and metrics against the Python original.
 *
 *   node tools/art_pipeline/test_js_pipeline.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const core = require('../../docs/art-core.js');
const { decodePng, encodePng } = require('./png-codec');

const ASSETS = path.join(__dirname, 'test_assets');
const PY = path.join(__dirname, 'coinduel_art_pipeline.py');

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  <- ' + detail : '')); }
}

/**
 * Run the Python original for the same input, so verdicts can be compared.
 * Exit code 3 is a legitimate QA rejection, not a crash.
 */
function runPython(file, preset) {
  const p = core.PRESETS[preset];
  const out = path.join(os.tmpdir(), 'jspipe_' + path.basename(file));
  const argv = [
    PY, '--in', file, '--out', out,
    '--asset-id', path.basename(file, '.png'),
    '--layer-type', preset, '--theme', 'classic',
    '--need-cutout', String(p.need_cutout).toLowerCase(),
    '--punch-holes', String(p.punch_holes).toLowerCase(),
    '--allow-edge-bleed', String(p.allow_edge_bleed).toLowerCase(),
    '--width', String(p.width), '--height', String(p.height),
    '--fill-min', String(p.fill_min), '--fill-max', String(p.fill_max),
    '--shadow-opacity', String(p.shadow_opacity),
  ];
  let stdout;
  try {
    stdout = execFileSync('python', argv, { encoding: 'utf8' });
  } catch (e) {
    if (e.status === 3 || e.status === 2) stdout = e.stdout;
    else throw e;
  }
  try { fs.unlinkSync(out); } catch {}
  return JSON.parse(stdout.trim().split('\n').pop());
}

const CASES = [
  ['coin_gold_01.png', 'coin_token'],
  ['maodie_cat_01.png', 'coin_token'],
  ['coin_bakery_01.png', 'coin_token'],
];

for (const [file, preset] of CASES) {
  const full = path.join(ASSETS, file);
  if (!fs.existsSync(full)) { check(file + ' present', false); continue; }

  console.log('\n' + file + '  (' + preset + ')');

  const t0 = Date.now();
  const img = decodePng(fs.readFileSync(full));
  const js = core.runPipeline(img, preset, {});
  const elapsed = Date.now() - t0;
  console.log(`  pipeline ran in ${elapsed}ms (pure JS, no Python)`);

  const py = runPython(full, preset);

  // 1. verdict
  check('  status matches Python', js.status === py.status,
    `js=${js.status} py=${py.status}`);
  if (js.status === 'Retry') {
    check('  error_reason matches', js.error_reason === py.error_reason,
      `js="${js.error_reason}" py="${py.error_reason}"`);
  }

  // 2. metrics
  const jm = js.metrics, pm = py.metrics;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  check('  fill_ratio matches', near(jm.fill_ratio, pm.fill_ratio, 0.01),
    `js=${jm.fill_ratio} py=${pm.fill_ratio}`);
  check('  aspect matches', near(jm.aspect, pm.aspect, 0.002));
  check('  center_dev matches', near(jm.center_dev, pm.center_dev, 0.01));

  // 3. a real PNG comes out
  if (js.status === 'Done' && js.image) {
    const buf = encodePng(js.image);
    check('  produced a PNG', buf.length > 1000, buf.length + ' bytes');
    // and it decodes back to the same size
    const back = decodePng(buf);
    check('  output is ' + js.image.w + 'x' + js.image.h,
      back.w === js.image.w && back.h === js.image.h,
      `${back.w}x${back.h}`);
    // transparency really applied
    let transparent = 0, opaque = 0;
    for (let i = 3; i < back.d.length; i += 4) {
      if (back.d[i] < 8) transparent++;
      if (back.d[i] > 248) opaque++;
    }
    check('  cutout produced transparency', transparent > 1000,
      transparent + ' transparent px');
    check('  subject still opaque', opaque > 1000, opaque + ' opaque px');
  }
}

console.log('\n' + '='.repeat(56));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
