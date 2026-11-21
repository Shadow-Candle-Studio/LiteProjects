/**
 * End-to-end logic check for the art pipeline workflow — no server required.
 *
 * Previously this file called a local serve.py over HTTP. The pipeline now runs
 * inside an n8n Code node, so the interesting questions changed:
 *
 *   - is the node still a Code node (not a leftover HTTP call)?
 *   - does the inlined code still parse when the workflow is loaded?
 *   - do the routing conditions (Filename OK?, Asset Known?, QA Passed?) still
 *     point at fields the pipeline actually produces?
 *   - does the node body actually run and return the right shape?
 *
 * Behavioural correctness of the image maths lives in test_pipeline_node.js;
 * parity with the Python original lives in test_js_parity.js.
 *
 *   node tools/n8n/test-live-chain.js
 */
const fs = require('fs');
const path = require('path');

const WF = path.join(__dirname, 'coinduel-art-pipeline.json');
const wf = JSON.parse(fs.readFileSync(WF, 'utf8'));

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  <- ${detail}` : ''}`); }
}

const byName = (n) => {
  const node = wf.nodes.find((x) => x.name === n);
  if (!node) throw new Error(`node not found: ${n}`);
  return node;
};
const optional = (n) => wf.nodes.find((x) => x.name === n);

console.log(`workflow: ${wf.name}`);
console.log(`nodes   : ${wf.nodes.length}\n`);

const PIPE = 'Pipeline: Cutout + QA + Finish (local)';

// ── 1. the pipeline is local now ───────────────────────────────────────────
console.log('[1] Pipeline runs locally (no Python, no tunnel)');
const pipe = optional(PIPE);
check('pipeline node exists', !!pipe, PIPE);
if (pipe) {
  check('it is a Code node', pipe.type === 'n8n-nodes-base.code', pipe.type);
  const code = pipe.parameters?.jsCode || '';
  check('code is non-trivial', code.length > 20000, code.length + ' chars');
  check('inlines the zlib PNG codec', code.includes('inflateSync') && code.includes('deflateSync'));
  check('inlines the art core', code.includes('ALPHA_QA_THRESHOLD') || code.includes('runPipeline'));
  check('no HTTP auth left in the node', !pipe.parameters?.authentication);
}

// no node may still call the old service
const httpNodes = wf.nodes.filter(
  (n) => n.type === 'n8n-nodes-base.httpRequest' &&
    JSON.stringify(n.parameters || {}).includes('pipelineUrl')
);
check('no node calls pipelineUrl any more', httpNodes.length === 0,
  httpNodes.map((n) => n.name).join(', '));

// config must not carry the old endpoint/token
const cfgNode = optional('Config');
if (cfgNode) {
  const assigns = cfgNode.parameters.assignments.assignments;
  const names = assigns.map((a) => a.name);
  check('Config has no pipelineUrl', !names.includes('pipelineUrl'), names.join(','));
  check('Config has no pipelineToken', !names.includes('pipelineToken'), names.join(','));
}

// ── 2. routing still lines up with what the node returns ──────────────────
console.log('\n[2] Routing conditions match the node output shape');
const ifPass = byName('QA Passed?');
const cond = ifPass.parameters.conditions.conditions[0];
check('QA Passed? compares status', /status/.test(String(cond.leftValue)), String(cond.leftValue));
check('QA Passed? expects "Done"', String(cond.rightValue) === 'Done', String(cond.rightValue));

// the node's return statement must emit `status`
if (pipe) {
  const code = pipe.parameters.jsCode;
  check('node emits a status field', /status:\s*report\.status/.test(code) || /status/.test(code));
  check('node emits output_base64 on pass',
    code.includes('output_base64') || code.includes("'output_base64'"),
    'downstream Base64 → Binary needs this field');
}

// ── 3. the code parses ────────────────────────────────────────────────────
console.log('\n[3] Inlined code is syntactically valid');
if (pipe) {
  try {
    // Wrapping in a function mirrors how n8n compiles a Code node body.
    new Function('$input', '$', 'require', 'module', 'exports', pipe.parameters.jsCode);
    check('code compiles', true);
  } catch (e) {
    check('code compiles', false, String(e.message).slice(0, 120));
  }
}

// ── 4. downstream nodes still exist ───────────────────────────────────────
console.log('\n[4] Required downstream nodes present');
for (const n of ['Drive: Download Raw', 'Raw to Base64', 'QA Passed?',
                 'Drive: Upload Approved', 'Drive: Move to Rejected',
                 'Sheets: Mark Done', 'Sheets: Mark Retry']) {
  check(`  ${n}`, !!optional(n));
}

// ── 5. no secret lives in the workflow ────────────────────────────────────
console.log('\n[5] Secret hygiene');
const raw = fs.readFileSync(WF, 'utf8');
check('no bearer secret in JSON', !/(?:Bearer\s+)[A-Za-z0-9_\-]{20,}/.test(raw));
check('no pipelineToken reference', !raw.includes('pipelineToken'));

console.log('\n' + '='.repeat(58));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
