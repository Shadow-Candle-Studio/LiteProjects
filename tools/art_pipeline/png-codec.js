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
