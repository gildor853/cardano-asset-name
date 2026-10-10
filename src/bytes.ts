import { fail } from "./errors.js";

const HEX = "0123456789abcdef";

/** Bytes given either as a hex string (no `0x` prefix) or a `Uint8Array`. */
export type BytesInput = string | Uint8Array;

/** Encodes bytes as lowercase hex. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    out += HEX[b >> 4]! + HEX[b & 0x0f]!;
  }
  return out;
}

/** Decodes a hex string (case-insensitive, no `0x` prefix) into bytes. */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== "string") fail("InvalidHex", "Hex input must be a string");
  if (hex.length % 2 !== 0) fail("InvalidHex", "Hex string must have an even length");
  if (!/^[0-9a-fA-F]*$/.test(hex)) fail("InvalidHex", "Hex string contains non-hex characters");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** @internal Normalises a hex string or byte array into a fresh `Uint8Array`. */
export function toBytes(input: BytesInput): Uint8Array {
  if (input instanceof Uint8Array) return input.slice();
  return hexToBytes(input);
}

/** @internal Concatenates byte arrays. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * Encodes a string as UTF-8. Lone surrogates are rejected with `InvalidUtf8`
 * (they cannot be represented in UTF-8). No `TextEncoder` needed.
 */
export function utf8ToBytes(text: string): Uint8Array {
  if (typeof text !== "string") fail("InvalidUtf8", "Input must be a string");
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail("InvalidUtf8", `Lone surrogate at index ${i}`);
      cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
      i++;
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      fail("InvalidUtf8", `Lone surrogate at index ${i}`);
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * Strictly decodes UTF-8 (RFC 3629): overlong forms, surrogates, code points
 * above U+10FFFF and truncated sequences are rejected with `InvalidUtf8`
 * rather than replaced with U+FFFD. No `TextDecoder` needed.
 */
export function bytesToUtf8(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i]!;
    let cp: number;
    let need: number;
    let min: number;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i++;
      continue;
    } else if (b0 >= 0xc2 && b0 <= 0xdf) {
      cp = b0 & 0x1f;
      need = 1;
      min = 0x80;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      cp = b0 & 0x0f;
      need = 2;
      min = 0x800;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      cp = b0 & 0x07;
      need = 3;
      min = 0x10000;
    } else {
      fail("InvalidUtf8", `Invalid UTF-8 lead byte at offset ${i}`);
    }
    if (i + need >= bytes.length) fail("InvalidUtf8", `Truncated UTF-8 sequence at offset ${i}`);
    for (let k = 1; k <= need; k++) {
      const b = bytes[i + k]!;
      if ((b & 0xc0) !== 0x80) fail("InvalidUtf8", `Invalid UTF-8 continuation byte at offset ${i + k}`);
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp < min) fail("InvalidUtf8", `Overlong UTF-8 sequence at offset ${i}`);
    if (cp >= 0xd800 && cp <= 0xdfff) fail("InvalidUtf8", `UTF-8 encoded surrogate at offset ${i}`);
    if (cp > 0x10ffff) fail("InvalidUtf8", `Code point above U+10FFFF at offset ${i}`);
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}
