import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blake2b, bytesToHex, CardanoAssetError } from "../src/index.js";
import { RFC7693_ABC_512, RFC7693_SELFTEST_RESULT } from "./fixtures.js";

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

// RFC 7693 Appendix E: deterministic Fibonacci sequence generator.
function selftestSeq(len: number, seed: number): Uint8Array {
  const out = new Uint8Array(len);
  let a = Math.imul(0xdead4bad, seed) >>> 0;
  let b = 1;
  for (let i = 0; i < len; i++) {
    const t = (a + b) >>> 0;
    a = b;
    b = t;
    out[i] = (t >>> 24) & 0xff;
  }
  return out;
}

describe("blake2b (RFC 7693)", () => {
  it("matches Appendix A: BLAKE2b-512(\"abc\")", () => {
    expect(bytesToHex(blake2b(ascii("abc")))).toBe(RFC7693_ABC_512);
  });

  it("passes the Appendix E self-test (all digest/input lengths, keyed and unkeyed)", () => {
    const mdLens = [20, 32, 48, 64];
    const inLens = [0, 3, 128, 129, 255, 1024];
    const hashes: Uint8Array[] = [];
    for (const outlen of mdLens) {
      for (const inlen of inLens) {
        const input = selftestSeq(inlen, inlen);
        hashes.push(blake2b(input, outlen));
        const key = selftestSeq(outlen, outlen);
        hashes.push(blake2b(input, outlen, key));
      }
    }
    const all = new Uint8Array(hashes.reduce((n, h) => n + h.length, 0));
    let o = 0;
    for (const h of hashes) {
      all.set(h, o);
      o += h.length;
    }
    expect(Array.from(blake2b(all, 32))).toEqual(RFC7693_SELFTEST_RESULT);
  });

  it("agrees with node:crypto blake2b512 across block boundaries", () => {
    for (const n of [0, 1, 63, 64, 127, 128, 129, 255, 256, 257, 1000, 4096]) {
      const data = Uint8Array.from({ length: n }, (_, i) => (i * 131 + 17) & 0xff);
      expect(bytesToHex(blake2b(data))).toBe(createHash("blake2b512").update(data).digest("hex"));
    }
  });

  it("supports short digests (blake2b-160 and blake2b-224)", () => {
    // Known digests of the empty string.
    expect(bytesToHex(blake2b(new Uint8Array(0), 20))).toBe("3345524abf6bbe1809449224b5972c41790b6cf2");
    expect(bytesToHex(blake2b(new Uint8Array(0), 28))).toBe(
      "836cc68931c2e4e3e838602eca1902591d216837bafddfe6f0c8cb07",
    );
  });

  it("does not modify its input", () => {
    const data = Uint8Array.of(1, 2, 3);
    blake2b(data, 20, Uint8Array.of(9));
    expect(Array.from(data)).toEqual([1, 2, 3]);
  });

  it("rejects invalid parameters", () => {
    for (const len of [0, 65, 1.5, Number.NaN]) {
      expect(() => blake2b(new Uint8Array(0), len)).toThrow(CardanoAssetError);
    }
    expect(() => blake2b(new Uint8Array(0), 32, new Uint8Array(65))).toThrow(/key/);
    expect(() => blake2b("abc" as unknown as Uint8Array)).toThrow(CardanoAssetError);
  });
});
