import { attempt, fail, type Result } from "./errors.js";
import type { BytesInput } from "./bytes.js";
import { parseAssetId, toUnit, type AssetIdInput } from "./asset-id.js";
import { splitLabel, withLabel } from "./cip67.js";

/** The asset name labels registered by CIP-68. */
export const CIP68_LABELS = {
  /** Reference NFT holding the datum with the metadata. */
  REFERENCE_NFT: 100,
  /** NFT held by the user (CIP-25 inner structure). */
  NFT: 222,
  /** Fungible token held by the user. */
  FT: 333,
  /** Rich fungible token held by the user. */
  RFT: 444,
} as const;

/** One of the CIP-68 labels: 100, 222, 333 or 444. */
export type Cip68Label = (typeof CIP68_LABELS)[keyof typeof CIP68_LABELS];

/** A CIP-68 user token label: 222, 333 or 444. */
export type Cip68UserLabel = Exclude<Cip68Label, 100>;

/** CIP-68 token kind. */
export type Cip68Kind = "reference-nft" | "nft" | "ft" | "rft";

/** Maps a label number to its CIP-68 kind, or `null` for other labels. */
export function cip68KindOf(label: number): Cip68Kind | null {
  // A switch rather than an object lookup: no input can reach prototype members.
  switch (label) {
    case 100:
      return "reference-nft";
    case 222:
      return "nft";
    case 333:
      return "ft";
    case 444:
      return "rft";
    default:
      return null;
  }
}

/** `true` for 222, 333 and 444. */
export function isCip68UserLabel(label: number): label is Cip68UserLabel {
  return label === 222 || label === 333 || label === 444;
}

/** A parsed CIP-68 asset name. */
export interface Cip68AssetName {
  readonly label: Cip68Label;
  readonly kind: Cip68Kind;
  /** The name without the label (the shared part of user and reference tokens), lowercase hex. */
  readonly content: string;
}

/**
 * Parses an asset name with a CIP-68 label (100, 222, 333 or 444).
 * Throws `MissingLabel` if the name has no valid CIP-67 label and
 * `UnsupportedLabel` if the label is not one of the CIP-68 labels.
 */
export function parseCip68AssetName(assetName: BytesInput): Cip68AssetName {
  const { label, content } = splitLabel(assetName);
  if (label === null) fail("MissingLabel", "Asset name has no valid CIP-67 label");
  const kind = cip68KindOf(label);
  if (kind === null) fail("UnsupportedLabel", `Label ${label} is not a CIP-68 label (100, 222, 333, 444)`);
  return { label: label as Cip68Label, kind, content };
}

/** Non-throwing variant of {@link parseCip68AssetName}. */
export function tryParseCip68AssetName(assetName: BytesInput): Result<Cip68AssetName> {
  return attempt(() => parseCip68AssetName(assetName));
}

/** `true` if the asset name carries one of the CIP-68 labels (optionally of a given kind). */
export function isCip68AssetName(assetName: BytesInput, kind?: Cip68Kind): boolean {
  const r = tryParseCip68AssetName(assetName);
  return r.ok && (kind === undefined || r.value.kind === kind);
}

/** Options for {@link toReferenceName}. */
export interface ToReferenceOptions {
  /**
   * Accept any CIP-67 label other than 100 on the user token, not only the
   * CIP-68 user labels 222/333/444 (for standards built on CIP-68 later).
   * Default `false`.
   */
  readonly allowAnyLabel?: boolean;
}

/**
 * Derives the reference NFT name `(100)content` from a user token name
 * `(222|333|444)content`. Returns hex.
 */
export function toReferenceName(userTokenName: BytesInput, options: ToReferenceOptions = {}): string {
  const { label, content } = splitLabel(userTokenName);
  if (label === null) fail("MissingLabel", "User token name has no valid CIP-67 label");
  if (label === CIP68_LABELS.REFERENCE_NFT) {
    fail("UnsupportedLabel", "Asset name is already a reference NFT (label 100)");
  }
  if (!options?.allowAnyLabel && !isCip68UserLabel(label)) {
    fail("UnsupportedLabel", `Label ${label} is not a CIP-68 user token label (222, 333, 444)`);
  }
  return withLabel(CIP68_LABELS.REFERENCE_NFT, content);
}

/**
 * Derives the user token name `(userLabel)content` from a reference NFT name
 * `(100)content`. The user label cannot be inferred from the reference name,
 * so it must be given (222 NFT, 333 FT, 444 RFT, or any other label number).
 */
export function toUserName(referenceName: BytesInput, userLabel: number): string {
  const { label, content } = splitLabel(referenceName);
  if (label === null) fail("MissingLabel", "Reference NFT name has no valid CIP-67 label");
  if (label !== CIP68_LABELS.REFERENCE_NFT) {
    fail("UnsupportedLabel", `Expected a reference NFT name (label 100), got label ${label}`);
  }
  if (userLabel === CIP68_LABELS.REFERENCE_NFT) fail("UnsupportedLabel", "The user token label must not be 100");
  return withLabel(userLabel, content);
}

/** Like {@link toReferenceName}, for a whole asset ID; returns the reference NFT unit. */
export function toReferenceUnit(userToken: AssetIdInput | string, options: ToReferenceOptions = {}): string {
  const id = typeof userToken === "string" ? parseAssetId(userToken) : userToken;
  return toUnit({ policyId: id.policyId, assetName: toReferenceName(id.assetName ?? "", options) });
}

/** Like {@link toUserName}, for a whole asset ID; returns the user token unit. */
export function toUserUnit(referenceToken: AssetIdInput | string, userLabel: number): string {
  const id = typeof referenceToken === "string" ? parseAssetId(referenceToken) : referenceToken;
  return toUnit({ policyId: id.policyId, assetName: toUserName(id.assetName ?? "", userLabel) });
}
