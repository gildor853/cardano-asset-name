import { attempt, fail, type Result } from "./errors.js";
import { concatBytes, hexToBytes, type BytesInput } from "./bytes.js";
import { blake2b } from "./blake2b.js";
import { bech32Decode, bech32Encode } from "./bech32.js";
import { normalizeAssetName, normalizePolicyId, parseAssetId, type AssetIdInput } from "./asset-id.js";

/** Human-readable part of CIP-14 asset fingerprints. */
export const FINGERPRINT_HRP = "asset";
/** Length of the fingerprint digest in bytes (blake2b-160). */
export const FINGERPRINT_DIGEST_LENGTH = 20;

/**
 * Computes the CIP-14 asset fingerprint:
 * `bech32("asset", blake2b-160(policyId || assetName))`.
 *
 * Accepts a policy ID plus optional asset name (hex or bytes), or an
 * {@link AssetIdInput} object. For a unit or dotted asset ID string use
 * {@link fingerprintFromUnit}.
 */
export function assetFingerprint(policyId: BytesInput, assetName?: BytesInput): string;
export function assetFingerprint(id: AssetIdInput): string;
export function assetFingerprint(arg: BytesInput | AssetIdInput, assetName?: BytesInput): string {
  let policy: string;
  let name: string;
  if (arg === null || arg === undefined) return fail("InvalidPolicyId", "Policy ID or asset ID is required");
  if (typeof arg === "object" && !(arg instanceof Uint8Array)) {
    policy = normalizePolicyId(arg.policyId);
    name = normalizeAssetName(arg.assetName ?? "");
  } else {
    policy = normalizePolicyId(arg);
    name = normalizeAssetName(assetName ?? "");
  }
  const digest = blake2b(concatBytes(hexToBytes(policy), hexToBytes(name)), FINGERPRINT_DIGEST_LENGTH);
  return bech32Encode(FINGERPRINT_HRP, digest);
}

/** Computes the CIP-14 fingerprint of a unit (`policyId + assetNameHex`) or dotted asset ID. */
export function fingerprintFromUnit(unit: string): string {
  return assetFingerprint(parseAssetId(unit));
}

/**
 * Decodes a CIP-14 fingerprint to its 20-byte digest, checking the `asset`
 * prefix, the checksum and the length. Mixed case is rejected; an all
 * uppercase fingerprint is accepted. Note that a fingerprint is a hash: the
 * policy ID and asset name cannot be recovered from it.
 */
export function decodeFingerprint(fingerprint: string): Uint8Array {
  const { hrp, bytes } = bech32Decode(fingerprint);
  if (hrp !== FINGERPRINT_HRP) fail("InvalidFingerprint", `Expected prefix '${FINGERPRINT_HRP}', got '${hrp}'`);
  if (bytes.length !== FINGERPRINT_DIGEST_LENGTH) {
    fail("InvalidFingerprint", `Fingerprint digest must be ${FINGERPRINT_DIGEST_LENGTH} bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** Non-throwing variant of {@link decodeFingerprint}. */
export function tryDecodeFingerprint(fingerprint: string): Result<Uint8Array> {
  return attempt(() => decodeFingerprint(fingerprint));
}

/** `true` if `fingerprint` is a well-formed CIP-14 asset fingerprint. */
export function isAssetFingerprint(fingerprint: string): boolean {
  return attempt(() => decodeFingerprint(fingerprint)).ok;
}

/**
 * `true` if `fingerprint` is the CIP-14 fingerprint of the given asset.
 * Comparison is case-insensitive; malformed input returns `false`.
 */
export function matchesFingerprint(fingerprint: string, id: AssetIdInput | string): boolean {
  if (!isAssetFingerprint(fingerprint)) return false;
  const r = attempt(() => (typeof id === "string" ? fingerprintFromUnit(id) : assetFingerprint(id)));
  return r.ok && r.value === fingerprint.toLowerCase();
}
