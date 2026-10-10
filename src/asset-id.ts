import { attempt, fail, type Result } from "./errors.js";
import { bytesToHex, type BytesInput } from "./bytes.js";

/** Length of a policy ID in bytes (blake2b-224 script hash). */
export const POLICY_ID_LENGTH = 28;
/** Maximum length of an asset name in bytes (ledger limit). */
export const MAX_ASSET_NAME_LENGTH = 32;

const HEX_RE = /^[0-9a-fA-F]*$/;

/** A normalised asset ID: both parts as lowercase hex. */
export interface AssetId {
  /** 56-character lowercase hex policy ID. */
  readonly policyId: string;
  /** 0–64 character lowercase hex asset name (empty string for an empty name). */
  readonly assetName: string;
}

/** Accepted input for an asset ID: hex strings or raw bytes. */
export interface AssetIdInput {
  readonly policyId: BytesInput;
  /** Defaults to the empty asset name. */
  readonly assetName?: BytesInput;
}

/** Accepted textual forms for {@link parseAssetId}. */
export type AssetIdFormat = "unit" | "dotted" | "any";

/** Options for {@link parseAssetId}. */
export interface ParseAssetIdOptions {
  /**
   * `"unit"`: `policyId + assetNameHex` only; `"dotted"`: `policyId.assetNameHex` only;
   * `"any"` (default): either.
   */
  readonly format?: AssetIdFormat;
}

function hexOf(input: BytesInput, code: "InvalidPolicyId" | "InvalidAssetName", what: string): string {
  if (input instanceof Uint8Array) return bytesToHex(input);
  if (typeof input !== "string") fail(code, `${what} must be a hex string or Uint8Array`);
  if (input.length % 2 !== 0) fail("InvalidHex", `${what} hex must have an even length`);
  if (!HEX_RE.test(input)) fail("InvalidHex", `${what} contains non-hex characters`);
  return input.toLowerCase();
}

/**
 * Validates a policy ID (28 bytes; 56 hex characters or a `Uint8Array`) and
 * returns it as lowercase hex.
 */
export function normalizePolicyId(policyId: BytesInput): string {
  const hex = hexOf(policyId, "InvalidPolicyId", "Policy ID");
  if (hex.length !== POLICY_ID_LENGTH * 2) {
    fail("InvalidPolicyId", `Policy ID must be ${POLICY_ID_LENGTH} bytes, got ${hex.length / 2}`);
  }
  return hex;
}

/** `true` if `policyId` is a valid 28-byte policy ID. */
export function isPolicyId(policyId: BytesInput): boolean {
  return attempt(() => normalizePolicyId(policyId)).ok;
}

/**
 * Validates an asset name (0–32 bytes; hex or a `Uint8Array`) and returns it
 * as lowercase hex. To build a name from text use {@link assetNameFromUtf8}.
 */
export function normalizeAssetName(assetName: BytesInput): string {
  const hex = hexOf(assetName, "InvalidAssetName", "Asset name");
  if (hex.length > MAX_ASSET_NAME_LENGTH * 2) {
    fail("InvalidAssetName", `Asset name must be at most ${MAX_ASSET_NAME_LENGTH} bytes, got ${hex.length / 2}`);
  }
  return hex;
}

/** `true` if `assetName` is a valid hex (or byte) asset name of at most 32 bytes. */
export function isAssetName(assetName: BytesInput): boolean {
  return attempt(() => normalizeAssetName(assetName)).ok;
}

/** Builds a normalised {@link AssetId} from a policy ID and an optional asset name. */
export function assetId(policyId: BytesInput, assetName: BytesInput = ""): AssetId {
  return { policyId: normalizePolicyId(policyId), assetName: normalizeAssetName(assetName) };
}

/**
 * Parses an asset ID from its common textual forms:
 *
 * - unit (concatenated): `policyId + assetNameHex`, 56–120 hex characters,
 *   as used by Blockfrost, Koios, Lucid, Mesh and most wallets;
 * - dotted: `policyId.assetNameHex`, as printed by `cardano-cli`
 *   (the dot may be followed by an empty name).
 *
 * A bare 56-character policy ID parses as the asset with an empty name.
 * Hex is accepted in either case and returned lowercase. `"lovelace"` (ada)
 * is not a native asset and is rejected with `InvalidAssetId`.
 */
export function parseAssetId(input: string, options: ParseAssetIdOptions = {}): AssetId {
  const format = options?.format ?? "any";
  if (typeof input !== "string") fail("InvalidAssetId", "Asset ID must be a string");
  if (input === "lovelace") fail("InvalidAssetId", "'lovelace' (ada) is not a native asset");
  const dot = input.indexOf(".");
  if (dot !== -1) {
    if (format === "unit") fail("InvalidAssetId", "Expected the concatenated unit form, got a dotted asset ID");
    if (input.indexOf(".", dot + 1) !== -1) fail("InvalidAssetId", "Asset ID contains more than one '.'");
    const policy = input.slice(0, dot);
    const name = input.slice(dot + 1);
    if (!HEX_RE.test(policy) || !HEX_RE.test(name)) fail("InvalidHex", "Asset ID contains non-hex characters");
    return assetId(policy, name);
  }
  if (format === "dotted") fail("InvalidAssetId", "Expected the dotted form policyId.assetNameHex");
  if (!HEX_RE.test(input)) fail("InvalidHex", "Asset ID contains non-hex characters");
  if (input.length % 2 !== 0) fail("InvalidHex", "Asset ID hex must have an even length");
  const min = POLICY_ID_LENGTH * 2;
  const max = (POLICY_ID_LENGTH + MAX_ASSET_NAME_LENGTH) * 2;
  if (input.length < min) fail("InvalidAssetId", `Asset ID must be at least ${min} hex characters, got ${input.length}`);
  if (input.length > max) {
    fail("InvalidAssetName", `Asset ID is ${input.length} hex characters; the asset name exceeds ${MAX_ASSET_NAME_LENGTH} bytes`);
  }
  return assetId(input.slice(0, min), input.slice(min));
}

/** Non-throwing variant of {@link parseAssetId}. */
export function tryParseAssetId(input: string, options: ParseAssetIdOptions = {}): Result<AssetId> {
  return attempt(() => parseAssetId(input, options));
}

/** `true` if `input` parses as an asset ID (see {@link parseAssetId}). */
export function isAssetId(input: string, options: ParseAssetIdOptions = {}): boolean {
  return attempt(() => parseAssetId(input, options)).ok;
}

function normalizeInput(id: AssetIdInput | string): AssetId {
  return typeof id === "string" ? parseAssetId(id) : assetId(id.policyId, id.assetName ?? "");
}

/** Formats an asset ID as the concatenated unit `policyId + assetNameHex` (lowercase). */
export function toUnit(id: AssetIdInput | string): string {
  const { policyId, assetName } = normalizeInput(id);
  return policyId + assetName;
}

/**
 * Formats an asset ID in the dotted form `policyId.assetNameHex` (lowercase).
 * Like `cardano-cli`, an asset with an empty name is printed as the bare
 * policy ID.
 */
export function toDotted(id: AssetIdInput | string): string {
  const { policyId, assetName } = normalizeInput(id);
  return assetName === "" ? policyId : `${policyId}.${assetName}`;
}
