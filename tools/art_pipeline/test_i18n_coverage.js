/**
 * Guard: every CJK label in the shipped scenes must be translatable.
 *
 * The project stores Chinese text in .scene files and swaps it at runtime via
 * GameScene's textMap. A label missing from that map stays Chinese in every
 * language — which is how 剩餘 / 跳过教程 leaked into the English build.
 *
 * This fails the suite if a new CJK label appears without a mapping, or if a
 * mapping points at an i18n key that does not exist.
 *
 *   node tools/art_pipeline/test_i18n_coverage.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCENES = path.join(ROOT, 'CoinDuel2D', 'assets', 'Scenes');
const I18N = path.join(ROOT, 'CoinDuel2D', 'assets', 'Resources', 'i18n');
const GAME_SCENE_TS = path.join(ROOT, 'CoinDuel2D', 'assets', 'Scripts',
  'Scenes', 'GameScene.ts');

const CJK = /[\u4e00-\u9fff]/;

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  <- ${detail}` : ''}`); }
}

// ── the runtime map ───────────────────────────────────────────────────────
const ts = fs.readFileSync(GAME_SCENE_TS, 'utf8');
const mapBlock = ts.match(/const textMap: Record<string, string> = \{([\s\S]*?)\};/);
check('GameScene declares a textMap', !!mapBlock);

const textMap = {};
if (mapBlock) {
  const re = /'([^']*)':\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(mapBlock[1])) !== null) textMap[m[1]] = m[2];
}
console.log(`  (textMap has ${Object.keys(textMap).length} entries)\n`);

// ── every CJK label in every scene must be mapped ─────────────────────────
const localeFiles = fs.readdirSync(I18N).filter((f) => f.endsWith('.json'));
const locales = {};
for (const f of localeFiles) {
  locales[path.basename(f, '.json')] =
    JSON.parse(fs.readFileSync(path.join(I18N, f), 'utf8'));
}

let unmapped = 0;
let badKeys = 0;

for (const sceneFile of fs.readdirSync(SCENES).filter((f) => f.endsWith('.scene'))) {
  const data = JSON.parse(fs.readFileSync(path.join(SCENES, sceneFile), 'utf8'));
  const strings = new Set();

  for (const obj of data) {
    if (!obj || typeof obj !== 'object') continue;
    if (obj.__type__ !== 'cc.Label') continue;
    const s = obj._string;
    if (typeof s === 'string' && CJK.test(s)) strings.add(s);
  }

  if (strings.size === 0) continue;
  console.log(sceneFile);

  for (const s of [...strings].sort()) {
    const key = textMap[s];
    if (!key) {
      unmapped++;
      check(`  ${JSON.stringify(s)} is mapped`, false, 'add it to GameScene textMap');
      continue;
    }
    // the mapped key must exist in every locale
    const missing = Object.keys(locales).filter((l) => !(key in locales[l]));
    if (missing.length) {
      badKeys++;
      check(`  ${JSON.stringify(s)} -> ${key}`, false,
        `key missing from ${missing.join(', ')}`);
    } else {
      console.log(`  PASS  ${JSON.stringify(s)} -> ${key}`);
      pass++;
    }
  }
  console.log();
}

// ── summary ───────────────────────────────────────────────────────────────
check('no unmapped CJK labels', unmapped === 0, `${unmapped} found`);
check('all mapped keys exist in every locale', badKeys === 0, `${badKeys} bad`);

console.log('\n' + '='.repeat(58));
console.log(`${pass} passed, ${fail} failed`);
console.log(unmapped === 0 && badKeys === 0 ? 'FULLY TRANSLATABLE' : 'GAPS REMAIN');
process.exit(fail === 0 ? 0 : 1);
