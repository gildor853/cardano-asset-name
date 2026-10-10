import { fail, show } from "./errors.js";

// Minimal BLAKE2b (RFC 7693) with variable digest length and optional key.
// 64-bit words are held as (low, high) pairs of 32-bit integers so that the
// code runs everywhere without BigInt. Verified against RFC 7693 Appendix A
// and the Appendix E self-test, and against node:crypto in the test suite.

// prettier-ignore
const IV = /* @__PURE__ */ Uint32Array.of(
  0xf3bcc908, 0x6a09e667, 0x84caa73b, 0xbb67ae85, 0xfe94f82b, 0x3c6ef372, 0x5f1d36f1, 0xa54ff53a,
  0xade682d1, 0x510e527f, 0x2b3e6c1f, 0x9b05688c, 0xfb41bd6b, 0x1f83d9ab, 0x137e2179, 0x5be0cd19,
);

// prettier-ignore
const SIGMA = /* @__PURE__ */ Uint8Array.of(
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3,
  11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4,
  7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8,
  9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13,
  2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9,
  12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11,
  13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10,
  6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5,
  10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0,
);

const BLOCK = 128;

// v[a] += v[b] (64-bit, pairs at even index a and b)
function add(v: Uint32Array, a: number, b: number): void {
  const lo = v[a]! + v[b]!;
  v[a + 1] = v[a + 1]! + v[b + 1]! + (lo >= 0x100000000 ? 1 : 0);
  v[a] = lo;
}

// v[a] += (lo, hi)
function addConst(v: Uint32Array, a: number, lo: number, hi: number): void {
  const l = v[a]! + lo;
  v[a + 1] = v[a + 1]! + hi + (l >= 0x100000000 ? 1 : 0);
  v[a] = l;
}

function mix(v: Uint32Array, m: Uint32Array, a: number, b: number, c: number, d: number, x: number, y: number): void {
  let lo: number;
  let hi: number;
  add(v, a, b);
  addConst(v, a, m[x]!, m[x + 1]!);
  // d = rotr64(d ^ a, 32)
  lo = v[d]! ^ v[a]!;
  hi = v[d + 1]! ^ v[a + 1]!;
  v[d] = hi;
  v[d + 1] = lo;
  add(v, c, d);
  // b = rotr64(b ^ c, 24)
  lo = v[b]! ^ v[c]!;
  hi = v[b + 1]! ^ v[c + 1]!;
  v[b] = (lo >>> 24) ^ (hi << 8);
  v[b + 1] = (hi >>> 24) ^ (lo << 8);
  add(v, a, b);
  addConst(v, a, m[y]!, m[y + 1]!);
  // d = rotr64(d ^ a, 16)
  lo = v[d]! ^ v[a]!;
  hi = v[d + 1]! ^ v[a + 1]!;
  v[d] = (lo >>> 16) ^ (hi << 16);
  v[d + 1] = (hi >>> 16) ^ (lo << 16);
  add(v, c, d);
  // b = rotr64(b ^ c, 63) = rotl64(b ^ c, 1)
  lo = v[b]! ^ v[c]!;
  hi = v[b + 1]! ^ v[c + 1]!;
  v[b] = (hi >>> 31) ^ (lo << 1);
  v[b + 1] = (lo >>> 31) ^ (hi << 1);
}

function compress(h: Uint32Array, block: Uint8Array, offset: number, t: number, last: boolean): void {
  const v = new Uint32Array(32);
  const m = new Uint32Array(32);
  v.set(h, 0);
  v.set(IV, 16);
  // 128-bit byte counter; inputs here never exceed 2^53 bytes.
  v[24] = v[24]! ^ (t >>> 0);
  v[25] = v[25]! ^ Math.floor(t / 0x100000000);
  if (last) {
    v[28] = ~v[28]!;
    v[29] = ~v[29]!;
  }
  for (let i = 0; i < 32; i++) {
    const p = offset + i * 4;
    m[i] = block[p]! | (block[p + 1]! << 8) | (block[p + 2]! << 16) | (block[p + 3]! << 24);
  }
  for (let r = 0; r < 12; r++) {
    const s = (r % 10) * 16;
    mix(v, m, 0, 8, 16, 24, SIGMA[s]! * 2, SIGMA[s + 1]! * 2);
    mix(v, m, 2, 10, 18, 26, SIGMA[s + 2]! * 2, SIGMA[s + 3]! * 2);
    mix(v, m, 4, 12, 20, 28, SIGMA[s + 4]! * 2, SIGMA[s + 5]! * 2);
    mix(v, m, 6, 14, 22, 30, SIGMA[s + 6]! * 2, SIGMA[s + 7]! * 2);
    mix(v, m, 0, 10, 20, 30, SIGMA[s + 8]! * 2, SIGMA[s + 9]! * 2);
    mix(v, m, 2, 12, 22, 24, SIGMA[s + 10]! * 2, SIGMA[s + 11]! * 2);
    mix(v, m, 4, 14, 16, 26, SIGMA[s + 12]! * 2, SIGMA[s + 13]! * 2);
    mix(v, m, 6, 8, 18, 28, SIGMA[s + 14]! * 2, SIGMA[s + 15]! * 2);
  }
  for (let i = 0; i < 16; i++) h[i] = h[i]! ^ v[i]! ^ v[i + 16]!;
}

/**
 * Computes a BLAKE2b digest (RFC 7693) of `data`.
 *
 * @param digestLength Output length in bytes, 1–64 (default 64). CIP-14 uses 20.
 * @param key Optional key of 0–64 bytes (keyed BLAKE2b / MAC).
 */
export function blake2b(data: Uint8Array, digestLength = 64, key: Uint8Array = new Uint8Array(0)): Uint8Array {
  if (!(data instanceof Uint8Array)) fail("InvalidArgument", "blake2b input must be a Uint8Array");
  if (!Number.isInteger(digestLength) || digestLength < 1 || digestLength > 64) {
    fail("InvalidArgument", `blake2b digest length must be 1-64 bytes, got ${show(digestLength)}`);
  }
  if (!(key instanceof Uint8Array) || key.length > 64) fail("InvalidArgument", "blake2b key must be at most 64 bytes");

  const h = IV.slice();
  h[0] = h[0]! ^ 0x01010000 ^ (key.length << 8) ^ digestLength;

  // With a key, the first block is the zero-padded key.
  let input = data;
  if (key.length > 0) {
    input = new Uint8Array(BLOCK + data.length);
    input.set(key, 0);
    input.set(data, BLOCK);
  }

  let t = 0;
  let offset = 0;
  // Compress every full block except the last one.
  while (input.length - offset > BLOCK) {
    t += BLOCK;
    compress(h, input, offset, t, false);
    offset += BLOCK;
  }
  const last = new Uint8Array(BLOCK);
  last.set(input.subarray(offset), 0);
  t += input.length - offset;
  compress(h, last, 0, t, true);

  const out = new Uint8Array(digestLength);
  for (let i = 0; i < digestLength; i++) out[i] = (h[i >> 2]! >>> (8 * (i & 3))) & 0xff;
  return out;
}
