import { describe, expect, it } from "vitest";
import {
  crc8,
  decodeLabel,
  encodeLabel,
  encodeLabelBytes,
  getLabel,
  hasLabel,
  hexToBytes,
  isLabel,
  splitLabel,
  tryDecodeLabel,
  withLabel,
  withLabelUtf8,
} from "../src/index.js";
import { CIP67_CRC8_TABLE, CIP67_VECTORS } from "./fixtures.js";

describe("CIP-67 CRC-8", () => {
  it("reproduces the lookup table printed in CIP-67 (polynomial 0x07)", () => {
    const table = Array.from({ length: 256 }, (_, i) => crc8(Uint8Array.of(i)));
    expect(table).toEqual(CIP67_CRC8_TABLE);
  });

  it("matches the CIP-67 worked example: crc8(0x00de) = 0x14", () => {
    expect(crc8(Uint8Array.of(0x00, 0xde))).toBe(0x14);
  });

  it("matches the CRC-8/SMBUS check value", () => {
    // Standard check: CRC of ASCII "123456789" is 0xF4 for poly 0x07, init 0.
    expect(crc8(Uint8Array.from("123456789", (c) => c.charCodeAt(0)))).toBe(0xf4);
    expect(crc8(new Uint8Array(0))).toBe(0);
  });
});

describe("CIP-67 labels", () => {
  it.each(CIP67_VECTORS)("encodes and decodes the official vector %i -> %s", (label, hex) => {
    expect(encodeLabel(label)).toBe(hex);
    expect(encodeLabelBytes(label)).toEqual(hexToBytes(hex));
    expect(decodeLabel(hex)).toBe(label);
    expect(decodeLabel(hex.toUpperCase())).toBe(label);
    expect(decodeLabel(hexToBytes(hex))).toBe(label);
    expect(isLabel(hex)).toBe(true);
    expect(getLabel(hex)).toBe(label);
  });

  it("matches the CIP-67 worked example and CIP-68 labels", () => {
    expect(encodeLabel(222)).toBe("000de140");
    expect(encodeLabel(100)).toBe("000643b0");
  });

  it("round-trips every label 0..65535", () => {
    for (let n = 0; n <= 0xffff; n++) {
      const bytes = encodeLabelBytes(n);
      if (decodeLabel(bytes) !== n || bytes[0]! >> 4 !== 0 || (bytes[3]! & 0x0f) !== 0) {
        throw new Error(`round trip failed for ${n}`);
      }
    }
  });

  it("rejects out-of-range label numbers", () => {
    for (const n of [-1, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => encodeLabel(n)).toThrow(expect.objectContaining({ code: "InvalidLabel" }));
    }
  });

  it.each([
    ["000de141", "trailing bracket not zero"],
    ["100de140", "leading bracket not zero"],
    ["000de150", "wrong checksum"],
    ["000de1", "too short"],
    ["000de14000", "too long"],
    ["", "empty"],
  ])("rejects %j (%s)", (hex) => {
    const r = tryDecodeLabel(hex);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("InvalidLabel");
    expect(isLabel(hex)).toBe(false);
  });

  it("rejects bad hex with InvalidHex", () => {
    expect(() => decodeLabel("000de14g")).toThrow(expect.objectContaining({ code: "InvalidHex" }));
  });
});

describe("labelled asset names", () => {
  it("detects and splits labels", () => {
    const name = withLabelUtf8(222, "GiveYouUp");
    expect(name).toBe("000de14047697665596f755570");
    expect(getLabel(name)).toBe(222);
    expect(hasLabel(name)).toBe(true);
    expect(hasLabel(name, 222)).toBe(true);
    expect(hasLabel(name, 100)).toBe(false);
    expect(splitLabel(name)).toEqual({ label: 222, content: "47697665596f755570" });
  });

  it("returns null / false for unlabelled names", () => {
    for (const name of ["", "504154415445", "000de1", "000de150aa", "ff"]) {
      expect(getLabel(name)).toBeNull();
      expect(hasLabel(name)).toBe(false);
      expect(splitLabel(name)).toEqual({ label: null, content: name });
    }
    expect(hasLabel("zz")).toBe(false);
  });

  it("allows a label with empty content", () => {
    expect(withLabel(333)).toBe("0014df10");
    expect(splitLabel("0014df10")).toEqual({ label: 333, content: "" });
  });

  it("limits labelled content to 28 bytes", () => {
    expect(withLabel(222, "00".repeat(28))).toHaveLength(64);
    expect(() => withLabel(222, "00".repeat(29))).toThrow(expect.objectContaining({ code: "InvalidAssetName" }));
    expect(() => withLabelUtf8(222, "x".repeat(29))).toThrow(expect.objectContaining({ code: "InvalidAssetName" }));
  });
});
