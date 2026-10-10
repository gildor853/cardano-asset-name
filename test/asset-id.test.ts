import { describe, expect, it } from "vitest";
import {
  assetId,
  hexToBytes,
  isAssetId,
  isAssetName,
  isPolicyId,
  normalizeAssetName,
  normalizePolicyId,
  parseAssetId,
  toDotted,
  toUnit,
  tryParseAssetId,
} from "../src/index.js";

const POLICY = "1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209";
const NAME = "504154415445"; // "PATATE" (CIP-14)

describe("policy IDs and asset names", () => {
  it("normalises policy IDs to lowercase hex", () => {
    expect(normalizePolicyId(POLICY.toUpperCase())).toBe(POLICY);
    expect(normalizePolicyId(hexToBytes(POLICY))).toBe(POLICY);
    expect(isPolicyId(POLICY)).toBe(true);
  });

  it("rejects policy IDs of the wrong length or with bad hex", () => {
    expect(() => normalizePolicyId(POLICY.slice(2))).toThrow(expect.objectContaining({ code: "InvalidPolicyId" }));
    expect(() => normalizePolicyId(POLICY + "00")).toThrow(expect.objectContaining({ code: "InvalidPolicyId" }));
    expect(() => normalizePolicyId(POLICY.slice(1) + "g")).toThrow(expect.objectContaining({ code: "InvalidHex" }));
    expect(() => normalizePolicyId(POLICY.slice(1))).toThrow(expect.objectContaining({ code: "InvalidHex" }));
    expect(() => normalizePolicyId(new Uint8Array(27))).toThrow(expect.objectContaining({ code: "InvalidPolicyId" }));
    expect(() => normalizePolicyId(42 as unknown as string)).toThrow(expect.objectContaining({ code: "InvalidPolicyId" }));
    expect(isPolicyId("")).toBe(false);
  });

  it("accepts asset names of 0 to 32 bytes", () => {
    expect(normalizeAssetName("")).toBe("");
    expect(normalizeAssetName("AB".repeat(32))).toBe("ab".repeat(32));
    expect(isAssetName(new Uint8Array(32))).toBe(true);
    expect(isAssetName(new Uint8Array(33))).toBe(false);
    expect(() => normalizeAssetName("00".repeat(33))).toThrow(expect.objectContaining({ code: "InvalidAssetName" }));
    expect(() => normalizeAssetName("0")).toThrow(expect.objectContaining({ code: "InvalidHex" }));
  });
});

describe("parseAssetId", () => {
  it("parses the concatenated unit form", () => {
    expect(parseAssetId(POLICY + NAME)).toEqual({ policyId: POLICY, assetName: NAME });
    expect(parseAssetId((POLICY + NAME).toUpperCase())).toEqual({ policyId: POLICY, assetName: NAME });
  });

  it("parses the dotted form", () => {
    expect(parseAssetId(`${POLICY}.${NAME}`)).toEqual({ policyId: POLICY, assetName: NAME });
    expect(parseAssetId(`${POLICY}.`)).toEqual({ policyId: POLICY, assetName: "" });
  });

  it("treats a bare policy ID as the empty asset name", () => {
    expect(parseAssetId(POLICY)).toEqual({ policyId: POLICY, assetName: "" });
  });

  it("accepts the maximum 32-byte name and rejects 33 bytes", () => {
    const max = POLICY + "ff".repeat(32);
    expect(parseAssetId(max).assetName).toHaveLength(64);
    expect(() => parseAssetId(max + "ff")).toThrow(expect.objectContaining({ code: "InvalidAssetName" }));
    expect(() => parseAssetId(`${POLICY}.${"ff".repeat(33)}`)).toThrow(
      expect.objectContaining({ code: "InvalidAssetName" }),
    );
  });

  it("honours the format option", () => {
    expect(isAssetId(`${POLICY}.${NAME}`, { format: "unit" })).toBe(false);
    expect(isAssetId(POLICY + NAME, { format: "dotted" })).toBe(false);
    expect(isAssetId(`${POLICY}.${NAME}`, { format: "dotted" })).toBe(true);
    expect(isAssetId(POLICY + NAME, { format: "unit" })).toBe(true);
  });

  it.each([
    ["lovelace", "InvalidAssetId"],
    ["policy.name", "InvalidHex"],
    ["", "InvalidAssetId"],
    [POLICY.slice(0, 54), "InvalidAssetId"],
    [POLICY + "0", "InvalidHex"],
    [`${POLICY}.${NAME}.00`, "InvalidAssetId"],
    [`${POLICY.slice(2)}.${NAME}`, "InvalidPolicyId"],
    [`${POLICY}.0`, "InvalidHex"],
    [`${POLICY}.zz`, "InvalidHex"],
    [` ${POLICY}`, "InvalidHex"],
    [`0x${POLICY}`, "InvalidHex"],
  ])("rejects %j with %s", (input, code) => {
    const r = tryParseAssetId(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(code);
  });

  it("rejects non-string input", () => {
    expect(() => parseAssetId(null as unknown as string)).toThrow(expect.objectContaining({ code: "InvalidAssetId" }));
  });
});

describe("formatting", () => {
  it("round-trips unit and dotted forms", () => {
    const unit = POLICY + NAME;
    expect(toUnit(unit)).toBe(unit);
    expect(toDotted(unit)).toBe(`${POLICY}.${NAME}`);
    expect(toUnit(toDotted(unit))).toBe(unit);
    expect(toUnit({ policyId: hexToBytes(POLICY), assetName: hexToBytes(NAME) })).toBe(unit);
    expect(toUnit(assetId(POLICY.toUpperCase(), NAME))).toBe(unit);
  });

  it("prints an empty name as the bare policy ID in dotted form, like cardano-cli", () => {
    expect(toDotted({ policyId: POLICY })).toBe(POLICY);
    expect(toUnit({ policyId: POLICY })).toBe(POLICY);
  });
});
