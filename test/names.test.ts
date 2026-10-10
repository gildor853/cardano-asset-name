import { describe, expect, it } from "vitest";
import {
  assetNameFromUtf8,
  assetNameToUtf8,
  bytesToUtf8,
  describeAssetName,
  displayAssetName,
  hexToBytes,
  isPrintableText,
  tryAssetNameToUtf8,
  utf8ToBytes,
  withLabelUtf8,
} from "../src/index.js";

const enc = new TextEncoder();

describe("UTF-8", () => {
  it("encodes like TextEncoder", () => {
    for (const s of ["", "PATATE", "Příliš žluťoučký kůň", "日本語", "🚀🦄", "a\u0000b", "\u{10ffff}"]) {
      expect(utf8ToBytes(s)).toEqual(enc.encode(s));
      expect(bytesToUtf8(utf8ToBytes(s))).toBe(s);
    }
  });

  it("rejects lone surrogates when encoding", () => {
    expect(() => utf8ToBytes("a\ud800")).toThrow(expect.objectContaining({ code: "InvalidUtf8" }));
    expect(() => utf8ToBytes("\udc00")).toThrow(expect.objectContaining({ code: "InvalidUtf8" }));
  });

  it.each([
    ["80", "stray continuation"],
    ["c0af", "overlong 2-byte"],
    ["e080af", "overlong 3-byte"],
    ["f08282ac", "overlong 4-byte"],
    ["eda080", "encoded surrogate"],
    ["f4908080", "above U+10FFFF"],
    ["f5808080", "invalid lead"],
    ["e282", "truncated"],
    ["c328", "bad continuation"],
    ["ff", "invalid byte"],
  ])("strictly rejects %s (%s)", (hex) => {
    expect(() => bytesToUtf8(hexToBytes(hex))).toThrow(expect.objectContaining({ code: "InvalidUtf8" }));
  });
});

describe("asset name text", () => {
  it("converts between text and hex", () => {
    expect(assetNameFromUtf8("PATATE")).toBe("504154415445");
    expect(assetNameToUtf8("504154415445")).toBe("PATATE");
    expect(assetNameFromUtf8("")).toBe("");
    expect(assetNameFromUtf8("x".repeat(32))).toHaveLength(64);
  });

  it("enforces the 32-byte limit on UTF-8 bytes, not characters", () => {
    expect(() => assetNameFromUtf8("x".repeat(33))).toThrow(expect.objectContaining({ code: "InvalidAssetName" }));
    expect(() => assetNameFromUtf8("ž".repeat(17))).toThrow(expect.objectContaining({ code: "InvalidAssetName" }));
    expect(assetNameFromUtf8("ž".repeat(16))).toHaveLength(64);
  });

  it("reports non-UTF-8 names", () => {
    const r = tryAssetNameToUtf8("ff00");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("InvalidUtf8");
  });

  it("detects printable text", () => {
    expect(isPrintableText("SpaceBud #42")).toBe(true);
    expect(isPrintableText("👩‍🚀")).toBe(true); // ZWJ sequence
    expect(isPrintableText("")).toBe(false);
    expect(isPrintableText("a\u0000")).toBe(false);
    expect(isPrintableText("tab\there")).toBe(false);
    expect(isPrintableText("\u0085")).toBe(false);
    expect(isPrintableText("abc\u202Edcba")).toBe(false); // RTL override
    expect(isPrintableText("zero\u200Bwidth")).toBe(false);
  });
});

describe("describeAssetName / displayAssetName", () => {
  it("shows printable UTF-8 names as text", () => {
    expect(describeAssetName("504154415445")).toEqual({
      hex: "504154415445",
      label: null,
      content: "504154415445",
      utf8: "PATATE",
      display: "PATATE",
    });
  });

  it("falls back to hex for binary names", () => {
    const hex = "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373";
    expect(displayAssetName(hex)).toBe(hex);
    expect(describeAssetName(hex).utf8).toBeNull();
    expect(displayAssetName("00ff")).toBe("00ff");
    expect(displayAssetName("4142430a")).toBe("4142430a"); // "ABC\n" is not printable
  });

  it("handles the empty name", () => {
    expect(describeAssetName("")).toEqual({ hex: "", label: null, content: "", utf8: null, display: "" });
  });

  it("uses CIP-68 notation for labelled names", () => {
    const name = withLabelUtf8(222, "TestToken");
    expect(displayAssetName(name)).toBe("(222)TestToken");
    expect(displayAssetName(name, { showLabel: false })).toBe("TestToken");
    expect(describeAssetName(name).label).toBe(222);
    const raw = describeAssetName(name, { detectLabel: false });
    expect(raw.label).toBeNull();
    expect(raw.display).toBe(name); // label bytes are not printable text
  });
});
