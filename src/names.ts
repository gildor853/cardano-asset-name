import { attempt, fail, type Result } from "./errors.js";
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes, type BytesInput } from "./bytes.js";
import { MAX_ASSET_NAME_LENGTH, normalizeAssetName } from "./asset-id.js";
import { splitLabel, withLabel } from "./cip67.js";

/**
 * Encodes text as a UTF-8 asset name and returns it as hex.
 * Throws `InvalidAssetName` if it is longer than 32 bytes.
 */
export function assetNameFromUtf8(text: string): string {
  const bytes = utf8ToBytes(text);
  if (bytes.length > MAX_ASSET_NAME_LENGTH) {
    fail("InvalidAssetName", `Asset name must be at most ${MAX_ASSET_NAME_LENGTH} bytes, got ${bytes.length} UTF-8 bytes`);
  }
  return bytesToHex(bytes);
}

/**
 * Decodes an asset name (hex or bytes) as strict UTF-8.
 * Throws `InvalidUtf8` if the bytes are not valid UTF-8.
 */
export function assetNameToUtf8(assetName: BytesInput): string {
  return bytesToUtf8(hexToBytes(normalizeAssetName(assetName)));
}

/** Non-throwing variant of {@link assetNameToUtf8}. */
export function tryAssetNameToUtf8(assetName: BytesInput): Result<string> {
  return attempt(() => assetNameToUtf8(assetName));
}

/** Prefixes UTF-8 `text` with a CIP-67 label, e.g. `withLabelUtf8(222, "GiveYouUp")`. Returns hex. */
export function withLabelUtf8(label: number, text: string): string {
  return withLabel(label, bytesToHex(utf8ToBytes(text)));
}

// Characters that make a name unsafe or misleading to show as text:
// C0/C1 controls and DEL, bidirectional formatting controls (Trojan Source),
// and invisible zero-width characters other than ZWJ (used by emoji).
function isUnsafeCodePoint(cp: number): boolean {
  return (
    cp < 0x20 ||
    (cp >= 0x7f && cp <= 0x9f) ||
    cp === 0x061c ||
    cp === 0x200b ||
    cp === 0x200e ||
    cp === 0x200f ||
    (cp >= 0x202a && cp <= 0x202e) ||
    cp === 0x2060 ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff
  );
}

/**
 * `true` if `text` is safe to display as an asset name: non-empty and free of
 * control characters, bidirectional overrides and invisible zero-width
 * characters (ZWJ is allowed for emoji sequences).
 */
export function isPrintableText(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  for (const ch of text) {
    if (isUnsafeCodePoint(ch.codePointAt(0)!)) return false;
  }
  return true;
}

/** Description of an asset name for display. */
export interface AssetNameInfo {
  /** The full asset name as lowercase hex. */
  readonly hex: string;
  /** CIP-67 label number, or `null` when unlabelled. */
  readonly label: number | null;
  /** The name without its label, as lowercase hex. */
  readonly content: string;
  /** The content decoded as UTF-8 when it is valid and printable, else `null`. */
  readonly utf8: string | null;
  /**
   * Human-readable name: the UTF-8 content when printable, otherwise the
   * content hex; prefixed with `(label)` when labelled (CIP-68 notation, e.g.
   * `"(222)GiveYouUp"`). Empty for an empty name.
   */
  readonly display: string;
}

/** Options for {@link describeAssetName}. */
export interface DescribeAssetNameOptions {
  /** Prefix `display` with `(label)` for CIP-67 labelled names. Default `true`. */
  readonly showLabel?: boolean;
  /**
   * Recognise CIP-67 labels at all. Default `true`. When `false`, the whole
   * name is treated as content.
   */
  readonly detectLabel?: boolean;
}

/**
 * Describes an asset name for display: detects a CIP-67 label, decodes the
 * rest as UTF-8 when it is valid and printable, and falls back to hex.
 */
export function describeAssetName(assetName: BytesInput, options: DescribeAssetNameOptions = {}): AssetNameInfo {
  const hex = normalizeAssetName(assetName);
  const { label, content } = options?.detectLabel === false ? { label: null, content: hex } : splitLabel(hex);
  const decoded = attempt(() => bytesToUtf8(hexToBytes(content)));
  const utf8 = decoded.ok && isPrintableText(decoded.value) ? decoded.value : null;
  const body = utf8 ?? content;
  const display = label !== null && options?.showLabel !== false ? `(${label})${body}` : body;
  return { hex, label, content, utf8, display };
}

/** Shorthand for `describeAssetName(assetName, options).display`. */
export function displayAssetName(assetName: BytesInput, options: DescribeAssetNameOptions = {}): string {
  return describeAssetName(assetName, options).display;
}
