import { fail } from "./errors.js";

// Minimal bech32 (BIP-173) encoder/decoder, adapted from cardano-bech32-utils.
// Used for CIP-14 fingerprints only, so every failure is `InvalidFingerprint`.

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3] as const;
const CHECKSUM_LENGTH = 6;
const LIMIT = 90;

function polymod(values: ArrayLike<number>): number {
  let chk = 1;
  for (let i = 0; i < values.length; i++) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ values[i]!;
    for (let j = 0; j < 5; j++) {
      if ((top >>> j) & 1) chk ^= GENERATOR[j]!;
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const maxv = (1 << to) - 1;
  const out: number[] = [];
  for (let i = 0; i < data.length; i++) {
    acc = ((acc << from) | data[i]!) & 0xffffff;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || (acc << (to - bits)) & maxv) {
    fail("InvalidFingerprint", "Invalid bech32 padding");
  }
  return out;
}

/** @internal Encodes bytes under a lowercase HRP. */
export function bech32Encode(hrp: string, bytes: Uint8Array): string {
  const words = convertBits(bytes, 8, 5, true);
  const mod = polymod([...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ 1;
  let out = hrp + "1";
  for (const w of words) out += CHARSET[w]!;
  for (let i = 0; i < CHECKSUM_LENGTH; i++) out += CHARSET[(mod >>> (5 * (5 - i))) & 31]!;
  return out;
}

/** @internal Decodes a bech32 string (BIP-173 rules, 90-character limit). HRP returned lowercase. */
export function bech32Decode(input: string): { hrp: string; bytes: Uint8Array } {
  if (typeof input !== "string") fail("InvalidFingerprint", "Fingerprint must be a string");
  if (input.length > LIMIT) fail("InvalidFingerprint", `Bech32 string longer than ${LIMIT} characters`);
  // BIP-173: only US-ASCII 33-126. Checked before case folding, because
  // toLowerCase() maps e.g. U+212A KELVIN SIGN to "k".
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 33 || c > 126) fail("InvalidFingerprint", `Invalid character at position ${i}`);
  }
  const lower = input.toLowerCase();
  if (input !== lower && input !== input.toUpperCase()) fail("InvalidFingerprint", "Bech32 string is mixed case");
  const sep = lower.lastIndexOf("1");
  if (sep < 1) fail("InvalidFingerprint", "Missing bech32 human-readable part or '1' separator");
  const hrp = lower.slice(0, sep);
  const data = lower.slice(sep + 1);
  if (data.length < CHECKSUM_LENGTH) fail("InvalidFingerprint", "Bech32 data part too short");
  const words: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = CHARSET.indexOf(data[i]!);
    if (v === -1) fail("InvalidFingerprint", `Invalid bech32 character at position ${sep + 1 + i}`);
    words.push(v);
  }
  if (polymod([...hrpExpand(hrp), ...words]) !== 1) fail("InvalidFingerprint", "Invalid bech32 checksum");
  return { hrp, bytes: Uint8Array.from(convertBits(words.slice(0, -CHECKSUM_LENGTH), 5, 8, false)) };
}
