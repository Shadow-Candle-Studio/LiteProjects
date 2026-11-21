// ─────────────────────────────────────────────────────────────────────────────
// CoinDuel art pipeline — runs entirely inside n8n.
//
// Replaces the HTTP call to serve.py. Everything below is inlined from
//   docs/art-core.js        (verified pixel-for-pixel against the Python original)
//   tools/art_pipeline/png-codec.js  (PNG encode/decode using only zlib)
//
// No external service, no tunnel, no local Python. The only Node built-in used
// is `zlib`, which n8n provides.
//
// Input : the previous node's item, carrying binary `data` (the raw upload) or
//         a json.image_base64 string.
// Output: the same report shape serve.py returned, plus `image_base64` on pass,
//         so downstream nodes (QA Passed?, Base64 → Binary) work unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const zlib = require('zlib');


// ── inline modules (UMD/CommonJS shims) ─────────────────────────────────────
const __core = (function () {
  // art-core.js is UMD: it takes the CommonJS branch when `module.exports`
  // exists. Provide that plus `self`, which its root expression references.
  const module = { exports: {} };
  const exports = module.exports;
  const self = {};
  (function () {
/**
 * CoinDuel art pipeline - browser/Node port of coinduel_art_pipeline.py
 *
 * This is a faithful port, not a reimplementation: same constants, same maths,
 * same employee-facing messages. tools/art_pipeline/test_js_parity.js proves it
 * by running this file and the Python original over the same pixels and
 * comparing the verdicts and metrics.
 *
 * No DOM, no canvas, no dependencies - so the identical code runs in a static
 * web page and in a headless test.
 *
 * Image representation: { w, h, d } where d is Float32Array(w*h*4), RGBA 0..255.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.artCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.1.0-web';

  // ---------------------------------------------------------------- tunables
  var ALPHA_QA_THRESHOLD = 0.5;
  var ALPHA_VISIBLE = 0.04;
  var WHITE_CUT = 246.0;
  var CLIP_EDGE_COVERAGE = 0.25;
  var DEFAULT_CENTER_TOL = 0.06;
  var MAX_PROC_SIDE = 640;
  var HOLE_MIN_FRAC = 0.08;

  // ------------------------------------------------------------------ helpers
  function boxRadiusForSigma(sigma) {
    if (sigma <= 0) return 0;
    return Math.max(0, Math.round((Math.sqrt(1 + 4 * sigma * sigma) - 1) / 2));
  }

  /** Moving average along x, zero-padded - matches numpy _box1d. */
  function boxH(src, w, h, r) {
    if (r <= 0) return src;
    var out = new Float32Array(w * h);
    var win = 2 * r + 1;
    var pre = new Float64Array(w + 1);
    for (var y = 0; y < h; y++) {
      var row = y * w;
      pre[0] = 0;
      for (var x = 0; x < w; x++) pre[x + 1] = pre[x] + src[row + x];
      for (var x2 = 0; x2 < w; x2++) {
        var lo = Math.max(0, x2 - r);
        var hi = Math.min(w, x2 + r + 1);
        out[row + x2] = (pre[hi] - pre[lo]) / win;
      }
    }
    return out;
  }

  /** Moving average along y, zero-padded. */
  function boxV(src, w, h, r) {
    if (r <= 0) return src;
    var out = new Float32Array(w * h);
    var win = 2 * r + 1;
    var pre = new Float64Array(h + 1);
    for (var x = 0; x < w; x++) {
      pre[0] = 0;
      for (var y = 0; y < h; y++) pre[y + 1] = pre[y] + src[y * w + x];
      for (var y2 = 0; y2 < h; y2++) {
        var lo = Math.max(0, y2 - r);
        var hi = Math.min(h, y2 + r + 1);
        out[y2 * w + x] = (pre[hi] - pre[lo]) / win;
      }
    }
    return out;
  }

  /** 3 chained box blurs ~= gaussian. Zero padding is correct for alpha. */
  function gaussian(src, w, h, sigma) {
    var r = boxRadiusForSigma(sigma);
    if (r <= 0) return src;
    var out = src;
    for (var i = 0; i < 3; i++) {
      out = boxH(out, w, h, r);
      out = boxV(out, w, h, r);
    }
    return out;
  }

  /** out[y] = in[y-dy], zero fill (numpy roll would wrap - we must not). */
  function shift(src, w, h, dy, dx) {
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
      var sy = y - dy;
      if (sy < 0 || sy >= h) continue;
      for (var x = 0; x < w; x++) {
        var sx = x - dx;
        if (sx < 0 || sx >= w) continue;
        out[y * w + x] = src[sy * w + sx];
      }
    }
    return out;
  }

  /** 4-connected flood fill from seed through passable. */
  function flood(seed, passable, w, h) {
    var out = new Uint8Array(w * h);
    var stack = new Int32Array(w * h);
    var sp = 0;
    for (var i = 0; i < w * h; i++) {
      if (seed[i] && passable[i]) { out[i] = 1; stack[sp++] = i; }
    }
    while (sp > 0) {
      var p = stack[--sp];
      var x = p % w;
      var y = (p - x) / w;
      if (x > 0) { var a = p - 1; if (passable[a] && !out[a]) { out[a] = 1; stack[sp++] = a; } }
      if (x < w - 1) { var b = p + 1; if (passable[b] && !out[b]) { out[b] = 1; stack[sp++] = b; } }
      if (y > 0) { var c = p - w; if (passable[c] && !out[c]) { out[c] = 1; stack[sp++] = c; } }
      if (y < h - 1) { var e = p + w; if (passable[e] && !out[e]) { out[e] = 1; stack[sp++] = e; } }
    }
    return out;
  }

  function median(values) {
    var a = Array.prototype.slice.call(values).sort(function (p, q) { return p - q; });
    var n = a.length;
    if (n === 0) return 0;
    return n % 2 ? a[(n - 1) / 2] : 0.5 * (a[n / 2 - 1] + a[n / 2]);
  }

  /**
   * Triangle-filter resample matching PIL's geometry exactly.
   *
   * The Python original calls PIL `Image.resize(..., BILINEAR)`. Pillow widens
   * the filter support when downscaling (filterscale = max(scale, 1)), so a
   * naive 4-tap bilinear averages too few pixels and shifts the resulting fill
   * ratio by a fraction of a percent. That is enough to flip a borderline
   * asset, so we replicate Pillow's maths rather than approximate it.
   */
  function resamplePIL(src, w, h, nw, nh) {
    function weights(dstLen, srcLen) {
      var scale = srcLen / dstLen;
      var fscale = scale < 1.0 ? 1.0 : scale;
      var support = 1.0 * fscale;
      var list = [];
      for (var d = 0; d < dstLen; d++) {
        var center = (d + 0.5) * scale;
        var lo = Math.floor(center - support + 0.5);
        var hi = Math.floor(center + support + 0.5);
        if (lo < 0) lo = 0;
        if (hi > srcLen) hi = srcLen;
        var ws = [];
        var sum = 0;
        for (var s = lo; s < hi; s++) {
          var t = Math.abs((s + 0.5 - center) / fscale);
          var wt = t < 1.0 ? 1.0 - t : 0.0;
          ws.push([s, wt]);
          sum += wt;
        }
        if (sum === 0 && ws.length) { ws[0][1] = 1; sum = 1; }
        for (var k = 0; k < ws.length; k++) ws[k][1] /= sum;
        list.push(ws);
      }
      return list;
    }

    var wx = weights(nw, w);
    var wy = weights(nh, h);

    // horizontal pass
    var tmp = new Float32Array(nw * h);
    for (var y = 0; y < h; y++) {
      var row = y * w;
      for (var x = 0; x < nw; x++) {
        var acc = 0, wl = wx[x];
        for (var i = 0; i < wl.length; i++) acc += src[row + wl[i][0]] * wl[i][1];
        tmp[y * nw + x] = acc;
      }
    }

    // vertical pass
    var out = new Float32Array(nw * nh);
    for (var y2 = 0; y2 < nh; y2++) {
      var wl2 = wy[y2];
      for (var x2 = 0; x2 < nw; x2++) {
        var acc2 = 0;
        for (var j = 0; j < wl2.length; j++) acc2 += tmp[wl2[j][0] * nw + x2] * wl2[j][1];
        out[y2 * nw + x2] = acc2;
      }
    }
    return out;
  }

  function resizeNearest(src, w, h, nw, nh) {
    var out = new Float32Array(nw * nh);
    for (var y = 0; y < nh; y++) {
      var sy = Math.min(h - 1, Math.floor((y + 0.5) * h / nh));
      for (var x = 0; x < nw; x++) {
        var sx = Math.min(w - 1, Math.floor((x + 0.5) * w / nw));
        out[y * nw + x] = src[sy * w + sx];
      }
    }
    return out;
  }

  /** Weighted distance from the background colour (0..255 scale). */
  function whiteDistanceAt(d, i, bg) {
    var r = d[i] - bg[0], g = d[i + 1] - bg[1], b = d[i + 2] - bg[2];
    var lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    var chroma2 = r * r + g * g + b * b - lum * lum;
    var chroma = Math.sqrt(chroma2 > 0 ? chroma2 : 0);
    return Math.sqrt(lum * lum + 1.6 * chroma * chroma);
  }

  // --------------------------------------------------------------- cutout
  function estimateBorderColor(img) {
    var w = img.w, h = img.h, d = img.d;
    var band = Math.max(2, Math.round(Math.min(h, w) * 0.02));
    var rs = [], gs = [], bs = [];

    function push(x, y) {
      var i = (y * w + x) * 4;
      rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]);
    }
    for (var y = 0; y < band; y++) for (var x = 0; x < w; x++) { push(x, y); push(x, h - 1 - y); }
    for (var x2 = 0; x2 < band; x2++) for (var y2 = 0; y2 < h; y2++) { push(x2, y2); push(w - 1 - x2, y2); }

    var bg = [median(rs), median(gs), median(bs)];

    var dist = new Float64Array(rs.length);
    for (var k = 0; k < rs.length; k++) {
      var dr = rs[k] - bg[0], dg = gs[k] - bg[1], db = bs[k] - bg[2];
      dist[k] = Math.sqrt(dr * dr + dg * dg + db * db);
    }
    var within = 0;
    for (var m = 0; m < dist.length; m++) if (dist[m] <= 18.0) within++;
    var purity = within / dist.length;

    var med = median(dist);
    var dev = new Float64Array(dist.length);
    for (var n = 0; n < dist.length; n++) dev[n] = Math.abs(dist[n] - med);
    var mad = median(dev);
    var sigma = Math.max(1.5, 1.4826 * mad);

    return { bg: bg, purity: purity, sigma: sigma };
  }

  function cutout(img, punchHoles) {
    var w = img.w, h = img.h, d = img.d;
    var info = {
      applied: false, method: 'none', bg_color: [], border_purity: 1,
      noise_sigma: 0, t_lo: 0, t_hi: 0, holes_punched: false
    };

    // Some generators already hand us a real alpha channel - trust it.
    var minA = 255, transparent = 0;
    for (var i = 3; i < d.length; i += 4) {
      var a = d[i];
      if (a < minA) minA = a;
      if (a / 255 < ALPHA_VISIBLE) transparent++;
    }
    var hadAlpha = minA < 0.98 * 255;
    if (hadAlpha && transparent / (w * h) > 0.02) {
      info.applied = true;
      info.method = 'existing-alpha';
      return { img: img, info: info };
    }

    var est = estimateBorderColor(img);
    var bg = est.bg;
    info.bg_color = [round1(bg[0]), round1(bg[1]), round1(bg[2])];
    info.border_purity = round4(est.purity);
    info.noise_sigma = Math.round(est.sigma * 100) / 100;

    var tLo = Math.max(6.0, 3.0 * est.sigma);
    var tHi = Math.max(22.0, 2.4 * tLo);
    info.t_lo = Math.round(tLo * 100) / 100;
    info.t_hi = Math.round(tHi * 100) / 100;

    // --- work small for the flood, then upsample the decision --------------
    var scale = Math.min(1.0, MAX_PROC_SIDE / Math.max(h, w));
    var sw = Math.max(8, Math.round(w * scale));
    var sh = Math.max(8, Math.round(h * scale));

    var dFull = new Float32Array(w * h);
    for (var p = 0, q = 0; p < d.length; p += 4, q++) dFull[q] = whiteDistanceAt(d, p, bg);

    var dSmall = resamplePIL(dFull, w, h, sw, sh);

    var seed = new Uint8Array(sw * sh);
    var passable = new Uint8Array(sw * sh);
    var gate = Math.max(tLo, tHi * 0.5);
    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        var idx = y * sw + x;
        var v = dSmall[idx];
        passable[idx] = v <= gate ? 1 : 0;
        var border = (y === 0 || y === sh - 1 || x === 0 || x === sw - 1);
        seed[idx] = border && v <= tLo ? 1 : 0;
      }
    }

    var bgSmall = flood(seed, passable, sw, sh);

    if (punchHoles) {
      var enclosed = new Uint8Array(sw * sh);
      var enclosedCount = 0;
      for (var j = 0; j < sw * sh; j++) {
        if (passable[j] && !bgSmall[j]) { enclosed[j] = 1; enclosedCount++; }
      }
      var enclosedArea = enclosedCount / (sh * sw);
      info.holes_punched = enclosedArea >= HOLE_MIN_FRAC;
      if (info.holes_punched) {
        var holes = flood(enclosed, passable, sw, sh);
        for (var j2 = 0; j2 < sw * sh; j2++) if (holes[j2]) bgSmall[j2] = 1;
      }
    }

    var bgProb = new Float32Array(sw * sh);
    for (var k = 0; k < sw * sh; k++) bgProb[k] = bgSmall[k];
    bgProb = resizeNearest(bgProb, sw, sh, w, h);
    bgProb = gaussian(bgProb, w, h, Math.max(0.6, 0.8 * scale));

    // remap so the ramp is centred on 0.5 coverage (blur flattens it)
    for (var m = 0; m < bgProb.length; m++) {
      var t = (bgProb[m] - 0.20) / 0.60;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      bgProb[m] = t * t * (3 - 2 * t);
    }

    var out = new Float32Array(d.length);
    for (var r2 = 0; r2 < w * h; r2++) {
      var al = 1 - bgProb[r2];
      if (al < 0) al = 0; else if (al > 1) al = 1;

      // kill stray near-white speckle the flood could not reach in the bg area
      if (al < 0.98 && dFull[r2] < tLo * 0.6) al = 0;

      var o4 = r2 * 4;
      var rr = d[o4], gg = d[o4 + 1], bb = d[o4 + 2];

      // despill the antialiased rim (kills the pinkish/grey halo)
      if (al > 0.02 && al < 0.985) {
        var inv = 1 - al;
        var den = al > 0.25 ? al : 0.25;
        rr = (rr - bg[0] * inv) / den;
        gg = (gg - bg[1] * inv) / den;
        bb = (bb - bg[2] * inv) / den;
      }
      out[o4] = clamp255(rr);
      out[o4 + 1] = clamp255(gg);
      out[o4 + 2] = clamp255(bb);
      out[o4 + 3] = al * 255;
    }

    info.applied = true;
    info.method = info.holes_punched ? 'flood-white+holes' : 'flood-white';
    return { img: { w: w, h: h, d: out }, info: info };
  }

  // ------------------------------------------------------- metrics + QA
  function contentMask(img, needCutout) {
    var mask = new Uint8Array(img.w * img.h);
    var d = img.d;
    for (var p = 0, q = 0; q < mask.length; q++, p += 4) {
      var a = d[p + 3] / 255;
      if (needCutout) {
        mask[q] = a >= ALPHA_QA_THRESHOLD ? 1 : 0;
      } else {
        var opaque = a > 0.5;
        var nearWhite = Math.min(d[p], d[p + 1], d[p + 2]) >= WHITE_CUT;
        mask[q] = opaque && !nearWhite ? 1 : 0;
      }
    }
    return mask;
  }

  function measure(img, rule) {
    var w = img.w, h = img.h;
    var mask = contentMask(img, rule.need_cutout);

    var area = 0;
    for (var i = 0; i < mask.length; i++) area += mask[i];
    var fill = area / (w * h);

    var x0 = 0, x1 = 0, y0 = 0, y1 = 0, bw = 0, bh = 0, dx = 0, dy = 0;
    if (area > 0) {
      var minX = w, maxX = -1, minY = h, maxY = -1;
      for (var y = 0; y < h; y++) {
        var row = y * w;
        for (var x = 0; x < w; x++) {
          if (!mask[row + x]) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      x0 = minX; x1 = maxX; y0 = minY; y1 = maxY;
      bw = x1 - x0 + 1;
      bh = y1 - y0 + 1;
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      dx = (cx - (w - 1) / 2) / (w / 2);
      dy = (cy - (h - 1) / 2) / (h / 2);
    }

    function edgeMean(fn) {
      var c = 0;
      for (var k = 0; k < fn.length; k++) c += mask[fn[k]];
      return c / fn.length;
    }
    var topCol = [], botCol = [], leftCol = [], rightCol = [];
    for (var xx = 0; xx < w; xx++) { topCol.push(xx); botCol.push((h - 1) * w + xx); }
    for (var yy = 0; yy < h; yy++) { leftCol.push(yy * w); rightCol.push(yy * w + w - 1); }

    var coverage = {
      top: edgeMean(topCol),
      bottom: edgeMean(botCol),
      left: edgeMean(leftCol),
      right: edgeMean(rightCol)
    };
    var clipped = [], clippedFrac = [];
    Object.keys(coverage).forEach(function (side) {
      if (coverage[side] >= CLIP_EDGE_COVERAGE) {
        clipped.push(side);
        clippedFrac.push(side + ' (' + Math.round(coverage[side] * 100) + '%)');
      }
    });

    var targetAspect = (rule.target_w && rule.target_h)
      ? round4(rule.target_w / rule.target_h) : null;

    return {
      width: w,
      height: h,
      aspect: round4(w / h),
      target_aspect: targetAspect,
      fill_ratio: round4(fill),
      fill_pct: (fill * 100).toFixed(1) + '%',
      fill_min: rule.fill_min,
      fill_max: rule.fill_max,
      bbox: [x0, y0, bw, bh],
      bbox_center_dx: round4(dx),
      bbox_center_dy: round4(dy),
      center_dev: round4(Math.max(Math.abs(dx), Math.abs(dy))),
      center_tol: rule.center_tol,
      edge_coverage: {
        top: round4(coverage.top), bottom: round4(coverage.bottom),
        left: round4(coverage.left), right: round4(coverage.right)
      },
      clipped_edges: clippedFrac,
      solidity: (bw && bh) ? round4(area / (bw * bh)) : 0.0
    };
  }

  function qa(metrics, rule) {
    var fails = [], warns = [];

    if (metrics.target_aspect) {
      var ta = metrics.target_aspect;
      if (Math.abs(metrics.aspect - ta) > ta * 0.02) {
        fails.push('Aspect ratio ' + metrics.width + 'x' + metrics.height +
          ' (' + metrics.aspect.toFixed(3) + ') is not ' + ta.toFixed(3) +
          ' (+/-2%)');
      }
    }

    var fill = metrics.fill_ratio;
    if (fill < rule.fill_min) {
      fails.push('Fill ratio ' + metrics.fill_pct + ' is below ' +
        Math.round(rule.fill_min * 100) + '% minimum');
    } else if (fill > rule.fill_max) {
      fails.push('Fill ratio ' + metrics.fill_pct + ' is above ' +
        Math.round(rule.fill_max * 100) + '% maximum ' +
        '(subject touches or overflows the canvas)');
    }

    if (metrics.clipped_edges.length && !rule.allow_edge_bleed) {
      fails.push('Subject clipped at canvas edge: ' + metrics.clipped_edges.join(', '));
    }

    if (!rule.allow_edge_bleed && metrics.center_dev > rule.center_tol) {
      fails.push('Subject off-centre (dx=' + signed1(metrics.bbox_center_dx * 100) + '%, ' +
        'dy=' + signed1(metrics.bbox_center_dy * 100) + '%, ' +
        'max ' + Math.round(rule.center_tol * 100) + '%)');
    }

    if (rule.target_w && rule.target_h) {
      if (metrics.width < rule.target_w * 0.9 || metrics.height < rule.target_h * 0.9) {
        warns.push('Source ' + metrics.width + 'x' + metrics.height + ' is below spec ' +
          rule.target_w + 'x' + rule.target_h + ' - upscaled, will look soft');
      }
    }
    if (metrics.solidity && metrics.solidity < 0.45) {
      warns.push('Silhouette is very thin (solidity ' + metrics.solidity.toFixed(2) + ')');
    }

    return { passed: fails.length === 0, fails: fails, warns: warns };
  }

  // ------------------------------------------------------ fit + paper-cut
  /** Resizer hook: browsers inject a canvas Lanczos; Node falls back to bilinear. */
  var resizer = null;
  function setResizer(fn) { resizer = fn; }

  function resizeImg(img, nw, nh) {
    if (img.w === nw && img.h === nh) return img;
    if (resizer) return resizer(img, nw, nh);
    var out = new Float32Array(nw * nh * 4);
    for (var c = 0; c < 4; c++) {
      var plane = new Float32Array(img.w * img.h);
      for (var p = 0, q = 0; q < plane.length; q++, p += 4) plane[q] = img.d[p + c];
      var scaled = resamplePIL(plane, img.w, img.h, nw, nh);
      for (var r = 0, s = 0; r < scaled.length; r++, s += 4) out[s + c] = scaled[r];
    }
    return { w: nw, h: nh, d: out };
  }

  function placeOnCanvas(img, w, h) {
    var mask = contentMask(img, true);
    var minX = img.w, maxX = -1, minY = img.h, maxY = -1;
    for (var y = 0; y < img.h; y++) {
      var row = y * img.w;
      for (var x = 0; x < img.w; x++) {
        if (!mask[row + x]) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    var out = { w: w, h: h, d: new Float32Array(w * h * 4) };
    if (maxX < 0) return out;

    var x0 = Math.max(0, minX - 2), y0 = Math.max(0, minY - 2);
    var x1 = Math.min(img.w - 1, maxX + 2), y1 = Math.min(img.h - 1, maxY + 2);
    var sw = x1 - x0 + 1, sh = y1 - y0 + 1;

    var sub = { w: sw, h: sh, d: new Float32Array(sw * sh * 4) };
    for (var yy = 0; yy < sh; yy++) {
      var srcOff = ((y0 + yy) * img.w + x0) * 4;
      sub.d.set(img.d.subarray(srcOff, srcOff + sw * 4), yy * sw * 4);
    }

    var scale = Math.min(1.0, w / sw, h / sh);
    var nw = Math.max(1, Math.round(sw * scale));
    var nh = Math.max(1, Math.round(sh * scale));
    var scaled = resizeImg(sub, nw, nh);

    // Composite centred. Destination starts fully transparent, so a source-over
    // blit is just a copy - no blending maths needed.
    var ox = Math.floor((w - nw) / 2);
    var oy = Math.floor((h - nh) / 2);
    for (var ry = 0; ry < nh; ry++) {
      var dy = oy + ry;
      if (dy < 0 || dy >= h) continue;
      for (var rx = 0; rx < nw; rx++) {
        var dx = ox + rx;
        if (dx < 0 || dx >= w) continue;
        var si = (ry * nw + rx) * 4;
        var di = (dy * w + dx) * 4;
        out.d[di] = scaled.d[si];
        out.d[di + 1] = scaled.d[si + 1];
        out.d[di + 2] = scaled.d[si + 2];
        out.d[di + 3] = scaled.d[si + 3];
      }
    }
    return out;
  }

  function papercutFinish(img, opt) {
    var w = img.w, h = img.h;
    var alpha = new Float32Array(w * h);
    for (var p = 0, q = 0; q < alpha.length; q++, p += 4) alpha[q] = img.d[p + 3] / 255;

    // --- inner bevel: light from top-left --------------------------------
    var bevel = opt.bevel, gain = opt.bevel_gain;
    var ab = gaussian(alpha, w, h, Math.max(1.0, bevel * 0.55));
    var off = Math.max(1, Math.round(bevel * 0.5));
    var upLeft = shift(ab, w, h, -off, -off);
    var downRight = shift(ab, w, h, off, off);

    var subject = new Float32Array(img.d.length);
    for (var k = 0; k < w * h; k++) {
      var rl = ab[k] - upLeft[k]; if (rl < 0) rl = 0; else if (rl > 1) rl = 1;
      var rd = downRight[k] - ab[k]; if (rd < 0) rd = 0; else if (rd > 1) rd = 1;
      var shade = 1 + gain * (rl - 0.85 * rd);
      var i4 = k * 4;
      subject[i4] = clamp255(img.d[i4] * shade);
      subject[i4 + 1] = clamp255(img.d[i4 + 1] * shade);
      subject[i4 + 2] = clamp255(img.d[i4 + 2] * shade);
      subject[i4 + 3] = img.d[i4 + 3];
    }

    // --- ambient shadow: solid black, +4/+6, single opacity ---------------
    var shadowAlpha = new Float32Array(w * h);
    var clipFrac = 0;
    if (opt.shadow_opacity > 0) {
      var blurred = gaussian(alpha, w, h, opt.shadow_blur);
      var rawMass = 0;
      for (var s = 0; s < blurred.length; s++) {
        blurred[s] *= opt.shadow_opacity;
        rawMass += blurred[s];
      }
      shadowAlpha = shift(blurred, w, h, opt.shadow_dy, opt.shadow_dx);
      var moved = 0;
      for (var t = 0; t < shadowAlpha.length; t++) moved += shadowAlpha[t];
      if (rawMass > 0) clipFrac = Math.max(0, 1 - moved / rawMass);
    }

    // --- composite shadow UNDER the subject (straight alpha) --------------
    var out = new Float32Array(img.d.length);
    for (var m = 0; m < w * h; m++) {
      var sa = shadowAlpha[m];
      if (sa < 0) sa = 0; else if (sa > 1) sa = 1;
      var ta = subject[m * 4 + 3] / 255;
      var oa = ta + sa * (1 - ta);
      var o4 = m * 4;
      if (oa <= 0) { out[o4 + 3] = 0; continue; }
      // shadow is black, so only the subject contributes colour
      out[o4] = subject[o4] * ta / oa;
      out[o4 + 1] = subject[o4 + 1] * ta / oa;
      out[o4 + 2] = subject[o4 + 2] * ta / oa;
      out[o4 + 3] = oa * 255;
    }

    return {
      img: { w: w, h: h, d: out },
      info: {
        bevel_px: bevel,
        bevel_gain: gain,
        shadow_offset: [opt.shadow_dx, opt.shadow_dy],
        shadow_blur_px: opt.shadow_blur,
        shadow_opacity: opt.shadow_opacity,
        shadow_clipped: round4(clipFrac)
      }
    };
  }

  // ------------------------------------------------------------ presets
  // Mirrors Style_Rules in the Google Sheet. Hardcoded so the page works with
  // no Google account and no network.
  var PRESETS = {
    coin_token: {
      label: '金币 / coin_token', width: 1024, height: 1024,
      fill_min: 0.73, fill_max: 0.83, need_cutout: true,
      punch_holes: false, allow_edge_bleed: false, shadow_opacity: 0.22
    },
    board_surface: {
      label: '棋盘底 / board_surface', width: 1920, height: 1080,
      fill_min: 0.98, fill_max: 1.00, need_cutout: false,
      punch_holes: false, allow_edge_bleed: true, shadow_opacity: 0.0
    },
    board_frame: {
      label: '棋盘框 / board_frame', width: 1920, height: 1080,
      fill_min: 0.00, fill_max: 1.00, need_cutout: true,
      punch_holes: true, allow_edge_bleed: true, shadow_opacity: 0.0
    },
    ui_element: {
      label: '界面元素 / ui_element', width: 512, height: 512,
      fill_min: 0.60, fill_max: 0.80, need_cutout: true,
      punch_holes: false, allow_edge_bleed: false, shadow_opacity: 0.22
    }
  };

  // ------------------------------------------------------------- pipeline
  function runPipeline(img, presetKey, overrides) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var p = PRESETS[presetKey] || PRESETS.coin_token;
    var opt = Object.assign({}, p, overrides || {});

    var rule = {
      need_cutout: !!opt.need_cutout,
      fill_min: opt.fill_min,
      fill_max: opt.fill_max,
      target_w: opt.width,
      target_h: opt.height,
      center_tol: DEFAULT_CENTER_TOL,
      allow_edge_bleed: !!opt.allow_edge_bleed
    };

    var report = {
      ok: false,
      asset_id: opt.asset_id || '',
      layer_type: presetKey,
      theme: opt.theme || 'classic',
      status: 'Invalid',
      error_reason: '',
      warnings: [],
      pipeline_version: VERSION,
      source: { width: img.w, height: img.h }
    };

    // --- 0. aspect gate FIRST, on the untouched source -------------------
    // Resizing before this check would normalise the aspect ratio and make the
    // QA gate unable to ever fail it.
    if (rule.target_w && rule.target_h) {
      var srcAspect = img.w / img.h;
      var tgt = rule.target_w / rule.target_h;
      if (Math.abs(srcAspect - tgt) > tgt * 0.02) {
        report.status = 'Retry';
        report.error_reason = 'Aspect ratio ' + img.w + 'x' + img.h +
          ' (' + srcAspect.toFixed(3) + ') is not ' + tgt.toFixed(3) + ' (+/-2%)';
        report.failures = [report.error_reason];
        report.elapsed_ms = Math.round(elapsed(t0));
        return report;
      }
    }

    // --- 1. cutout -------------------------------------------------------
    var info = { applied: false, method: 'skipped (need_cutout=FALSE)' };
    var work = img;
    if (rule.need_cutout) {
      var cut = cutout(img, !!opt.punch_holes);
      work = cut.img;
      info = cut.info;
    }

    // --- 2. QA gate on the cut-out subject -------------------------------
    var metrics = measure(work, rule);
    var verdict = qa(metrics, rule);
    var warns = verdict.warns.slice();
    if (info.applied && info.border_purity < 0.65) {
      warns.push('Background not uniform (border purity ' +
        Math.round(info.border_purity * 100) + '%) - cutout may have eaten part ' +
        'of the subject or left a haze');
    }

    report.cutout = {
      applied: info.applied, method: info.method, bg_color: info.bg_color,
      border_purity: info.border_purity, holes_punched: info.holes_punched,
      t_lo: info.t_lo, t_hi: info.t_hi
    };
    report.metrics = metrics;
    report.warnings = warns;

    if (!verdict.passed) {
      report.status = 'Retry';
      report.error_reason = verdict.fails.join(' | ');
      report.failures = verdict.fails;
      report.elapsed_ms = Math.round(elapsed(t0));
      return report;
    }

    // --- 3. normalise to spec size, then finish --------------------------
    var ow = rule.target_w || work.w;
    var oh = rule.target_h || work.h;
    var final;

    if (rule.need_cutout) {
      var placed = placeOnCanvas(work, ow, oh);
      var fin = papercutFinish(placed, {
        bevel: 5.0, bevel_gain: 0.20,
        shadow_dx: 4, shadow_dy: 6, shadow_blur: 7.0,
        shadow_opacity: opt.shadow_opacity
      });
      final = fin.img;
      report.finish = fin.info;
    } else {
      // full-bleed layers get no shadow/bevel - a board surface must tile
      final = resizeImg(work, ow, oh);
      report.finish = { applied: false, reason: 'need_cutout=FALSE (full-bleed layer)' };
    }

    report.ok = true;
    report.status = 'Done';
    report.error_reason = '';
    report.output_size = { width: final.w, height: final.h };
    report.metrics_final = measure(final, rule);
    report.elapsed_ms = Math.round(elapsed(t0));
    report.image = final;
    return report;
  }

  // ------------------------------------------------------------- utilities
  function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function round1(v) { return Math.round(v * 10) / 10; }
  function round4(v) { return Math.round(v * 10000) / 10000; }
  function signed1(v) { return (v >= 0 ? '+' : '') + v.toFixed(1); }
  function elapsed(t0) {
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    return now - t0;
  }

  return {
    VERSION: VERSION,
    PRESETS: PRESETS,
    setResizer: setResizer,
    runPipeline: runPipeline,
    measure: measure,
    cutout: cutout,
    qa: qa,
    papercutFinish: papercutFinish,
    // exposed for the parity test
    _internals: { gaussian: gaussian, shift: shift, flood: flood, median: median, estimateBorderColor: estimateBorderColor }
  };
});

  }).call(self);
  return module.exports;
})();

const { decodePng, encodePng } = (function () {
  const module = { exports: {} };
  const exports = module.exports;
  const require = (name) => {
    if (name === 'zlib') return zlib;
    throw new Error('unsupported require in sandbox: ' + name);
  };
  (function () {
/**
 * Pure-JS PNG codec using only Node built-ins (zlib).
 *
 * Why: the art pipeline currently needs a Python service because browsers have
 * Canvas and n8n Code nodes do not. But Canvas is only used for decode/encode —
 * the actual image maths in docs/art-core.js is already plain Float32Array work.
 * If PNG can be read and written with zlib alone, the whole pipeline can run
 * inside an n8n Code node and the Python service becomes unnecessary.
 *
 * Scope: 8-bit RGB/RGBA, non-interlaced (what image generators emit).
 */
'use strict';

const zlib = require('zlib');

// ------------------------------------------------------------------ decode
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);

    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }

  if (bitDepth !== 8) throw new Error('bit depth ' + bitDepth + ' unsupported');
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error('colour type ' + colorType + ' unsupported');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = new Uint8Array(w * h * stride);
  let pos = 0;

  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const base = y * stride;
    const prev = base - stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[base + x - channels] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = y > 0 && x >= channels ? out[prev + x - channels] : 0;
      let v = row[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      out[base + x] = v & 0xff;
    }
  }

  // normalise to straight RGBA Float32
  const d = new Float32Array(w * h * 4);
  for (let i = 0, s = 0, t = 0; i < w * h; i++, s += channels, t += 4) {
    d[t] = out[s];
    d[t + 1] = out[s + 1];
    d[t + 2] = out[s + 2];
    d[t + 3] = channels === 4 ? out[s + 3] : 255;
  }
  return { w, h, d };
}

// ------------------------------------------------------------------ encode
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode an RGBA image to PNG. Uses filter 1 (Sub) which compresses well on flat art. */
function encodePng(img) {
  const { w, h, d } = img;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);

  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 1; // Sub filter
    for (let x = 0; x < stride; x++) {
      const src = (y * w) * 4 + x;
      const left = x >= 4 ? (d[src - 4] | 0) : 0;
      const v = (d[src] | 0);
      raw[rowStart + 1 + x] = (v - left) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { decodePng, encodePng };

  }).call({});
  return module.exports;
})();

// ── read the incoming image ────────────────────────────────────────────────
function readInput() {
  const item = $input.first();
  const j = item.json || {};
  const bin = item.binary || {};

  // Preferred: real binary from the Drive download.
  if (bin.data && bin.data.data) {
    return Buffer.from(bin.data.data, 'base64');
  }
  // Fallback: a base64 string prepared by the previous node.
  let s = String(j.image_base64 || '');
  if (!s) throw new Error('No image: neither binary.data nor json.image_base64 is present');
  if (s.indexOf('base64,') >= 0) s = s.split('base64,').pop();
  return Buffer.from(s.replace(/\s/g, ''), 'base64');
}

/**
 * Find the resolved task parameters.
 *
 * Cannot hardcode a node name: n8n appends `1` when a workflow is pasted into a
 * copy of itself, so the same JSON must work as `Resolve Task + Build Params`
 * and `Resolve Task + Build Params1`. Probe both, then fall back to scanning the
 * run data for an object that looks like resolved params.
 */
function findParams() {
  const candidates = [
    'Resolve Task + Build Params',
    'Resolve Task + Build Params1',
  ];

  for (const name of candidates) {
    try {
      const j = $(name).first().json;
      if (j && j.asset_id && j.layer_type) return j;
    } catch (e) {
      // node not present under that name; keep looking
    }
  }

  // Last resort: scan every item seen so far for the right shape.
  try {
    const all = $input.all();
    for (const it of all) {
      const j = it.json || {};
      if (j.asset_id && j.layer_type && typeof j.fill_min === 'number') return j;
    }
  } catch (e) { /* ignore */ }

  throw new Error(
    'Cannot find resolved task params. Expected a node named ' +
    '"Resolve Task + Build Params" (or "...1") producing asset_id + layer_type.'
  );
}

const pngBuffer = readInput();
const img = decodePng(pngBuffer);

// ── parameters come from the same source serve.py used ─────────────────────
const params = findParams();
const presetKey = params.layer_type || 'coin_token';
if (!__core.PRESETS[presetKey]) {
  throw new Error('unknown layer_type: ' + presetKey);
}

const report = __core.runPipeline(img, presetKey, {
  asset_id: params.asset_id,
  theme: params.theme,
  fill_min: params.fill_min,
  fill_max: params.fill_max,
  width: params.width,
  height: params.height,
  need_cutout: params.need_cutout,
  punch_holes: params.punch_holes,
  allow_edge_bleed: params.allow_edge_bleed,
  shadow_opacity: params.shadow_opacity,
});

// ── shape it like the old HTTP response ───────────────────────────────────
const out = {
  ok: report.status === 'Done',
  asset_id: report.asset_id,
  layer_type: report.layer_type,
  theme: report.theme,
  status: report.status,
  error_reason: report.error_reason || '',
  warnings: report.warnings || [],
  metrics: report.metrics,
  cutout: report.cutout,
  finish: report.finish,
  pipeline_version: report.pipeline_version || __core.VERSION,
  elapsed_ms: report.elapsed_ms,
};

if (report.status === 'Done' && report.image) {
  out.output_base64 = encodePng(report.image).toString('base64');
  out.output_size = { width: report.image.w, height: report.image.h };
}

return [{ json: out }];
