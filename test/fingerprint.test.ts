import { describe, expect, it } from "vitest";
import {
  assetFingerprint,
  bytesToHex,
  decodeFingerprint,
  fingerprintFromUnit,
  hexToBytes,
  isAssetFingerprint,
  matchesFingerprint,
  tryDecodeFingerprint,
} from "../src/index.js";
import { CIP14_VECTORS } from "./fixtures.js";

describe("CIP-14 asset fingerprint", () => {
  it.each(CIP14_VECTORS)("matches the official vector $fingerprint", ({ policyId, assetName, fingerprint }) => {
    expect(assetFingerprint(policyId, assetName)).toBe(fingerprint);
    expect(assetFingerprint({ policyId, assetName })).toBe(fingerprint);
    expect(assetFingerprint(hexToBytes(policyId), hexToBytes(assetName))).toBe(fingerprint);
    expect(fingerprintFromUnit(policyId + assetName)).toBe(fingerprint);
    expect(fingerprintFromUnit(`${policyId}.${assetName}`)).toBe(fingerprint);
    expect(isAssetFingerprint(fingerprint)).toBe(true);
    expect(decodeFingerprint(fingerprint)).toHaveLength(20);
    expect(matchesFingerprint(fingerprint, { policyId, assetName })).toBe(true);
    expect(matchesFingerprint(fingerprint.toUpperCase(), policyId + assetName)).toBe(true);
  });

  it("defaults to the empty asset name and accepts uppercase hex", () => {
    const v = CIP14_VECTORS[0];
    expect(assetFingerprint(v.policyId)).toBe(v.fingerprint);
    expect(assetFingerprint(v.policyId.toUpperCase())).toBe(v.fingerprint);
  });

  it("decodes to the blake2b-160 digest", () => {
    const fp = assetFingerprint(CIP14_VECTORS[0].policyId);
    expect(bytesToHex(decodeFingerprint(fp))).toHaveLength(40);
    expect(decodeFingerprint(fp.toUpperCase())).toEqual(decodeFingerprint(fp));
  });

  it("does not match a different asset", () => {
    const [a, b] = [CIP14_VECTORS[3], CIP14_VECTORS[4]];
    expect(matchesFingerprint(a.fingerprint, { policyId: b.policyId, assetName: b.assetName })).toBe(false);
    expect(matchesFingerprint("not a fingerprint", a.policyId)).toBe(false);
    expect(matchesFingerprint(a.fingerprint, "zz")).toBe(false);
  });

  it("rejects malformed fingerprints", () => {
    const good = CIP14_VECTORS[0].fingerprint;
    const flipped = good.slice(0, -1) + (good.endsWith("q") ? "p" : "q");
    const cases: string[] = [
      flipped, // checksum
      "Asset1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlc3", // mixed case
      "asset1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlcb", // wrong checksum char
      "pool1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlc3", // wrong prefix
      "asset1qqqqqqsy3a3n", // valid bech32 shape but wrong length / checksum
      "asset1", // too short
      "rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlc3", // no separator
      "asset1rjklcrnsdzqp65wjgrg55sy9723kw09mlgvlcb!", // bad char
      "",
    ];
    for (const c of cases) {
      expect(isAssetFingerprint(c)).toBe(false);
      const r = tryDecodeFingerprint(c);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("InvalidFingerprint");
    }
  });

  it("rejects a correctly checksummed bech32 string with the wrong digest length", async () => {
    // Build an `asset` bech32 string carrying 19 bytes using the internal encoder.
    const { bech32Encode } = await import("../src/bech32.js");
    const s = bech32Encode("asset", new Uint8Array(19));
    expect(() => decodeFingerprint(s)).toThrow(/20 bytes/);
    const t = bech32Encode("token", new Uint8Array(20));
    expect(() => decodeFingerprint(t)).toThrow(/prefix/);
  });

  it("validates inputs before hashing", () => {
    expect(() => assetFingerprint("abcd")).toThrow(expect.objectContaining({ code: "InvalidPolicyId" }));
    expect(() => assetFingerprint(CIP14_VECTORS[0].policyId, "00".repeat(33))).toThrow(
      expect.objectContaining({ code: "InvalidAssetName" }),
    );
  });
});

describe("fingerprint input hardening", () => {
  it("rejects non-ASCII characters that case-fold to bech32 characters (U+212A KELVIN SIGN)", () => {
    const fp = assetFingerprint("7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373", "504154415445");
    const upper = fp.toUpperCase();
    expect(isAssetFingerprint(upper)).toBe(true);
    const i = upper.indexOf("K", 6);
    if (i > 0) {
      const evil = upper.slice(0, i) + "\u212A" + upper.slice(i + 1);
      expect(isAssetFingerprint(evil)).toBe(false);
      expect(tryDecodeFingerprint(evil).ok).toBe(false);
    }
    expect(isAssetFingerprint("\u212A" + upper.slice(1))).toBe(false);
  });

  it("assetFingerprint rejects null/undefined with InvalidPolicyId", () => {
    for (const bad of [null, undefined]) {
      let code: string | undefined;
      try {
        assetFingerprint(bad as never);
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      expect(code).toBe("InvalidPolicyId");
    }
  });
});
