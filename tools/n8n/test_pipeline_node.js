/**
 * Run the generated n8n Code node outside n8n, with $input / $() shims.
 *
 * This is the only way to know the node works before importing it: a syntax
 * error or a missing shim would otherwise surface as a red node in n8n with a
 * stack trace full of inlined library code.
 *
 *   node tools/n8n/test_pipeline_node.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const NODE_FILE = path.join(__dirname, 'pipeline-code-node.js');
const ASSETS = path.join(__dirname, '..', 'art_pipeline', 'test_assets');
const CODEX = path.join(__dirname, '..', 'art_pipeline', 'png-codec.js');
const { decodePng } = require(CODEX);

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  <- ' + detail : '')); }
}

const code = fs.readFileSync(NODE_FILE, 'utf8');

/** Execute the node body with the helpers n8n would provide. */
function runNode({ binaryB64, params }) {
  const items = [{ json: {}, binary: binaryB64 ? { data: { data: binaryB64 } } : undefined }];

  const $input = {
    first: () => items[0],
    all: () => items,
    last: () => items[items.length - 1],
  };
  const $ = (name) => {
    // The node probes several names, mirroring n8n's behaviour when a workflow
    // is pasted into a copy of itself (names gain a `1` suffix).
    if (name === 'Resolve Task + Build Params' || name === 'Resolve Task + Build Params1') {
      return { first: () => ({ json: params }), all: () => [{ json: params }] };
    }
    throw new Error('unexpected $(' + name + ')');
  };

  const fn = new Function('$input', '$', 'require', 'module', 'exports', code);
  const result = fn($input, $, require, { exports: {} }, {});
  return result;
}

const CASES = [
  {
    file: 'coin_gold_01.png',
    params: {
      asset_id: 'coin_gold_01', layer_type: 'coin_token', theme: 'classic',
      width: 1024, height: 1024, fill_min: 0.73, fill_max: 0.83,
      need_cutout: true, punch_holes: false, allow_edge_bleed: false,
      shadow_opacity: 0.22,
    },
    expect: 'Done',
  },
  {
    file: 'coin_bakery_01.png',
    params: {
      asset_id: 'coin_bakery_01', layer_type: 'coin_token', theme: 'bakery',
      width: 1024, height: 1024, fill_min: 0.73, fill_max: 0.83,
      need_cutout: true, punch_holes: false, allow_edge_bleed: false,
      shadow_opacity: 0.22,
    },
    expect: 'Retry',
  },
];

for (const c of CASES) {
  const p = path.join(ASSETS, c.file);
  if (!fs.existsSync(p)) { check(c.file + ' present', false); continue; }

  console.log('\n' + c.file);
  const b64 = fs.readFileSync(p).toString('base64');

  let res;
  try {
    res = runNode({ binaryB64: b64, params: c.params });
  } catch (e) {
    check('  node executes', false, String(e.message).slice(0, 160));
    continue;
  }

  check('  node executes', true);
  check('  returns an item array', Array.isArray(res) && res.length === 1);

  const j = res[0].json;
  check('  status is ' + c.expect, j.status === c.expect, j.status);
  check('  has metrics', !!j.metrics && typeof j.metrics.fill_ratio === 'number',
    JSON.stringify(j.metrics || {}).slice(0, 80));

  if (c.expect === 'Done') {
    check('  output_base64 present', typeof j.output_base64 === 'string'
      && j.output_base64.length > 1000, (j.output_base64 || '').length + ' chars');
    check('  output_size 1024x1024', j.output_size
      && j.output_size.width === 1024 && j.output_size.height === 1024,
      JSON.stringify(j.output_size));

    // decode the produced PNG and confirm it really is transparent art
    try {
      const out = decodePng(Buffer.from(j.output_base64, 'base64'));
      check('  output decodes', out.w === 1024 && out.h === 1024,
        `${out.w}x${out.h}`);
      let transparent = 0;
      for (let i = 3; i < out.d.length; i += 4) if (out.d[i] < 8) transparent++;
      check('  output has transparency', transparent > 1000, transparent + ' px');
    } catch (e) {
      check('  output decodes', false, String(e.message).slice(0, 100));
    }
  } else {
    check('  error_reason explains the fill failure',
      /Fill ratio .* below .* minimum/.test(j.error_reason || ''), j.error_reason);
    check('  no output_base64 on rejection', !j.output_base64);
  }
}

console.log('\n' + '='.repeat(56));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
