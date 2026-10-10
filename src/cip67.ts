import { attempt, fail, show, type Result } from "./errors.js";
import { bytesToHex, toBytes, type BytesInput } from "./bytes.js";
import { MAX_ASSET_NAME_LENGTH, normalizeAssetName } from "./asset-id.js";

/** Length of a CIP-67 label prefix in bytes. */
export const LABEL_LENGTH = 4;
/** Largest CIP-67 label number (16 bits). */
export const MAX_LABEL = 0xffff;

// CRC-8 with polynomial 0x07 (x^8 + x^2 + x + 1), initial value 0x00, no
// reflection, no final XOR, as specified by CIP-67. The table is generated
// here and checked against the lookup table printed in CIP-67 by the tests.
const CRC8_TABLE = /* @__PURE__ */ (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    table[i] = c;
  }
  return table;
})();

/** CRC-8 checksum used by CIP-67 (polynomial `0x07`, init `0x00`). */
export function crc8(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) crc = CRC8_TABLE[crc ^ data[i]!]!;
  return crc;
}

function checkLabelNumber(label: number): void {
  if (!Number.isInteger(label) || label < 0 || label > MAX_LABEL) {
    fail("InvalidLabel", `Label must be an integer between 0 and ${MAX_LABEL}, got ${show(label)}`);
  }
}

/**
 * Encodes a label number as the 4-byte CIP-67 prefix
 * `[0000 | 16-bit label | 8-bit CRC-8 | 0000]`.
 */
export function encodeLabelBytes(label: number): Uint8Array {
  checkLabelNumber(label);
  const checksum = crc8(Uint8Array.of(label >> 8, label & 0xff));
  // Nibbles: 0, L3, L2, L1 | L0, C1, C0, 0
  return Uint8Array.of(
    label >> 12,
    (label >> 4) & 0xff,
    ((label & 0x0f) << 4) | (checksum >> 4),
    (checksum & 0x0f) << 4,
  );
}

/** Encodes a label number as its 8-character hex CIP-67 prefix, e.g. `222` → `"000de140"`. */
export function encodeLabel(label: number): string {
  return bytesToHex(encodeLabelBytes(label));
}

function readLabel(bytes: Uint8Array): number | string {
  if (bytes.length < LABEL_LENGTH) return `needs ${LABEL_LENGTH} bytes, got ${bytes.length}`;
  const b0 = bytes[0]!;
  const b1 = bytes[1]!;
  const b2 = bytes[2]!;
  const b3 = bytes[3]!;
  if (b0 >> 4 !== 0 || (b3 & 0x0f) !== 0) return "missing 0000 brackets";
  const label = ((b0 & 0x0f) << 12) | (b1 << 4) | (b2 >> 4);
  const checksum = ((b2 & 0x0f) << 4) | (b3 >> 4);
  if (crc8(Uint8Array.of(label >> 8, label & 0xff)) !== checksum) return "checksum mismatch";
  return label;
}

/**
 * Decodes an exactly 4-byte CIP-67 label (hex or bytes) to its number.
 * Throws `InvalidLabel` if the brackets or the CRC-8 checksum do not verify.
 * To read the label at the start of a longer asset name use {@link getLabel}.
 */
export function decodeLabel(label: BytesInput): number {
  const bytes = toBytes(label);
  if (bytes.length !== LABEL_LENGTH) fail("InvalidLabel", `A CIP-67 label is ${LABEL_LENGTH} bytes, got ${bytes.length}`);
  const result = readLabel(bytes);
  if (typeof result === "string") fail("InvalidLabel", `Invalid CIP-67 label: ${result}`);
  return result;
}

/** Non-throwing variant of {@link decodeLabel}. */
export function tryDecodeLabel(label: BytesInput): Result<number> {
  return attempt(() => decodeLabel(label));
}

/** `true` if `label` is exactly a valid 4-byte CIP-67 label. */
export function isLabel(label: BytesInput): boolean {
  return attempt(() => decodeLabel(label)).ok;
}

/**
 * Returns the CIP-67 label number at the start of an asset name, or `null`
 * if the name does not start with a valid label. Throws only for malformed
 * input (bad hex, name longer than 32 bytes).
 */
export function getLabel(assetName: BytesInput): number | null {
  const bytes = toBytes(normalizeAssetName(assetName));
  const result = readLabel(bytes);
  return typeof result === "number" ? result : null;
}

/** `true` if the asset name starts with a valid CIP-67 label (optionally a specific one). */
export function hasLabel(assetName: BytesInput, label?: number): boolean {
  const r = attempt(() => getLabel(assetName));
  if (!r.ok || r.value === null) return false;
  return label === undefined || r.value === label;
}

/** An asset name split into its CIP-67 label and the remaining content. */
export interface LabelledName {
  /** The label number, or `null` when the name carries no valid CIP-67 label. */
  readonly label: number | null;
  /** The rest of the name as lowercase hex (the whole name when unlabelled). */
  readonly content: string;
}

/** Splits an asset name into its CIP-67 label (if any) and content. */
export function splitLabel(assetName: BytesInput): LabelledName {
  const hex = normalizeAssetName(assetName);
  const label = getLabel(hex);
  return label === null ? { label: null, content: hex } : { label, content: hex.slice(LABEL_LENGTH * 2) };
}

/**
 * Prefixes `content` (hex or bytes, at most 28 bytes) with the CIP-67 label
 * and returns the asset name as hex. Use `assetNameFromUtf8` to turn text into
 * hex first, or pass the text through {@link withLabelUtf8}.
 */
export function withLabel(label: number, content: BytesInput = ""): string {
  const prefix = encodeLabel(label);
  const body = normalizeAssetName(content);
  if (body.length / 2 > MAX_ASSET_NAME_LENGTH - LABEL_LENGTH) {
    fail(
      "InvalidAssetName",
      `Labelled asset name content must be at most ${MAX_ASSET_NAME_LENGTH - LABEL_LENGTH} bytes, got ${body.length / 2}`,
    );
  }
  return prefix + body;
}
