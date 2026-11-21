/**
 * Verify the pure-JS PNG codec against real files and against Pillow.
 *
 *   node tools/art_pipeline/test_png_codec.js
 *
 * Checks:
 *   1. decode a real PNG, re-encode it, decode again -> pixels identical
 *   2. the re-encoded file is a valid PNG Pillow can open, with matching size
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { decodePng, encodePng } = require('./png-codec');

const ASSETS = path.join(__dirname, 'test_assets');
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  <- ' + detail : '')); }
}

const files = ['coin_gold_01.png', 'maodie_cat_01.png', 'coin_bakery_01.png'];

for (const f of files) {
  const p = path.join(ASSETS, f);
  if (!fs.existsSync(p)) { check(f + ' present', false); continue; }

  console.log('\n' + f);
  const original = fs.readFileSync(p);
  const img = decodePng(original);
  console.log(`  decoded ${img.w}x${img.h}, ${img.d.length} samples`);

  const outPath = path.join(process.env.TEMP || '/tmp', 'codec_' + f);
  const encoded = encodePng(img);
  fs.writeFileSync(outPath, encoded);
  console.log(`  re-encoded ${encoded.length} bytes (orig ${original.length})`);

  // 1. round trip is lossless
  const again = decodePng(fs.readFileSync(outPath));
  let same = again.w === img.w && again.h === img.h;
  if (same) {
    for (let i = 0; i < img.d.length; i++) {
      if (Math.abs(img.d[i] - again.d[i]) > 0.5) { same = false; break; }
    }
  }
  check('  round-trip is pixel-identical', same);

  // 2. Pillow can read it, and agrees on size
  try {
    const py = execFileSync('python', ['-c',
      'import sys,json;from PIL import Image;' +
      'im=Image.open(sys.argv[1]);' +
      'print(json.dumps({"w":im.size[0],"h":im.size[1],"mode":im.mode}))',
      outPath], { encoding: 'utf8' });
    const meta = JSON.parse(py.trim());
    check('  Pillow opens it', true);
    check('  Pillow size matches', meta.w === img.w && meta.h === img.h,
      `${meta.w}x${meta.h} vs ${img.w}x${img.h}`);
    check('  Pillow sees RGBA', meta.mode === 'RGBA', meta.mode);
  } catch (e) {
    check('  Pillow opens it', false, String(e.message).slice(0, 120));
  }

  // 3. alpha channel exists and is sane (source art is white-background, so it
  //    may legitimately be fully opaque; a cutout result will not be)
  let minA = 255, maxA = 0;
  for (let i = 3; i < img.d.length; i += 4) {
    if (img.d[i] < minA) minA = img.d[i];
    if (img.d[i] > maxA) maxA = img.d[i];
  }
  check('  alpha preserved through round-trip',
    again.d[3] === img.d[3], `${img.d[3]} -> ${again.d[3]}`);
  console.log(`  alpha range: ${Math.round(minA)}..${Math.round(maxA)}`);
}

console.log('\n' + '='.repeat(52));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
