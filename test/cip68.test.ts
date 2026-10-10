import { describe, expect, it } from "vitest";
import {
  CIP68_LABELS,
  assetNameFromUtf8,
  cip68KindOf,
  displayAssetName,
  encodeLabel,
  isCip68AssetName,
  isCip68UserLabel,
  parseCip68AssetName,
  toDotted,
  toReferenceName,
  toReferenceUnit,
  toUserName,
  toUserUnit,
  tryParseCip68AssetName,
  withLabel,
  withLabelUtf8,
} from "../src/index.js";
import { CIP68_EXAMPLE_POLICY, CIP68_NAME_VECTORS } from "./fixtures.js";

describe("CIP-68 labels", () => {
  it("has the registered label numbers and prefixes", () => {
    expect(CIP68_LABELS).toEqual({ REFERENCE_NFT: 100, NFT: 222, FT: 333, RFT: 444 });
    expect(encodeLabel(100)).toBe("000643b0"); // stated in CIP-68 "Labels"
    expect(encodeLabel(222)).toBe("000de140");
    expect(encodeLabel(333)).toBe("0014df10");
    expect(encodeLabel(444)).toBe("001bc280");
    expect(cip68KindOf(100)).toBe("reference-nft");
    expect(cip68KindOf(222)).toBe("nft");
    expect(cip68KindOf(333)).toBe("ft");
    expect(cip68KindOf(444)).toBe("rft");
    // No prototype members leak through for non-number input.
    expect(cip68KindOf("constructor" as never)).toBeNull();
    expect(cip68KindOf("toString" as never)).toBeNull();
    expect(cip68KindOf("100" as never)).toBeNull();
    expect(cip68KindOf(1)).toBeNull();
    expect([100, 222, 333, 444, 0].map(isCip68UserLabel)).toEqual([false, true, true, true, false]);
  });

  it.each(CIP68_NAME_VECTORS)(
    "builds and parses the CIP-68 example ($label)$content",
    ({ label, content, labelHex, contentHex, assetNameHex }) => {
      expect(encodeLabel(label)).toBe(labelHex);
      expect(assetNameFromUtf8(content)).toBe(contentHex);
      expect(withLabel(label, contentHex)).toBe(assetNameHex);
      expect(withLabelUtf8(label, content)).toBe(assetNameHex);
      const parsed = parseCip68AssetName(assetNameHex);
      expect(parsed.label).toBe(label);
      expect(parsed.content).toBe(contentHex);
      expect(displayAssetName(assetNameHex)).toBe(`(${label})${content}`);
    },
  );
});

describe("reference <-> user token names", () => {
  it("follows the CIP-68 example (222)Test123 <-> (100)Test123", () => {
    for (const userLabel of [222, 333, 444] as const) {
      const user = withLabelUtf8(userLabel, "Test123");
      const ref = withLabelUtf8(100, "Test123");
      expect(toReferenceName(user)).toBe(ref);
      expect(toUserName(ref, userLabel)).toBe(user);
      expect(isCip68AssetName(user)).toBe(true);
      expect(isCip68AssetName(ref, "reference-nft")).toBe(true);
      expect(isCip68AssetName(user, "reference-nft")).toBe(false);
    }
  });

  it("works on whole asset IDs (CIP-68 metadata retrieval example)", () => {
    const user = `${CIP68_EXAMPLE_POLICY}.${withLabelUtf8(222, "TestToken")}`;
    const ref = toReferenceUnit(user);
    expect(ref).toBe(CIP68_EXAMPLE_POLICY + withLabelUtf8(100, "TestToken"));
    expect(toDotted(toUserUnit(ref, 222))).toBe(user);
    expect(toReferenceUnit({ policyId: CIP68_EXAMPLE_POLICY, assetName: withLabelUtf8(333, "TestToken") })).toBe(ref);
    expect(toUserUnit({ policyId: CIP68_EXAMPLE_POLICY, assetName: withLabelUtf8(100, "TestToken") }, 444)).toBe(
      CIP68_EXAMPLE_POLICY + withLabelUtf8(444, "TestToken"),
    );
  });

  it("rejects names that cannot be converted", () => {
    expect(() => toReferenceName("504154415445")).toThrow(expect.objectContaining({ code: "MissingLabel" }));
    expect(() => toReferenceName(withLabelUtf8(100, "X"))).toThrow(expect.objectContaining({ code: "UnsupportedLabel" }));
    expect(() => toReferenceName(withLabelUtf8(500, "X"))).toThrow(expect.objectContaining({ code: "UnsupportedLabel" }));
    expect(toReferenceName(withLabelUtf8(500, "X"), { allowAnyLabel: true })).toBe(withLabelUtf8(100, "X"));
    expect(() => toUserName("504154415445", 222)).toThrow(expect.objectContaining({ code: "MissingLabel" }));
    expect(() => toUserName(withLabelUtf8(222, "X"), 222)).toThrow(expect.objectContaining({ code: "UnsupportedLabel" }));
    expect(() => toUserName(withLabelUtf8(100, "X"), 100)).toThrow(expect.objectContaining({ code: "UnsupportedLabel" }));
    expect(() => toUserName(withLabelUtf8(100, "X"), 70000)).toThrow(expect.objectContaining({ code: "InvalidLabel" }));
  });

  it("parseCip68AssetName reports why a name is not CIP-68", () => {
    const missing = tryParseCip68AssetName("504154415445");
    expect(!missing.ok && missing.error.code).toBe("MissingLabel");
    const other = tryParseCip68AssetName(withLabelUtf8(1, "X"));
    expect(!other.ok && other.error.code).toBe("UnsupportedLabel");
    expect(isCip68AssetName("zz")).toBe(false);
  });
});
