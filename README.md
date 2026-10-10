# cardano-asset-name

[![CI](https://github.com/gildor853/cardano-asset-name/actions/workflows/ci.yml/badge.svg)](https://github.com/gildor853/cardano-asset-name/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
![dependencies: 0](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

Provided as is, without warranty — see [DISCLAIMER.md](./DISCLAIMER.md).

Tiny, zero-dependency TypeScript helpers for **Cardano native assets**:
policy ID + asset name parsing, CIP-14 asset fingerprints, CIP-67 asset name
labels and CIP-68 reference/user token names. Works in Node.js and browsers
(`Uint8Array` only, no `Buffer`, no `TextEncoder`).

## Why

Every wallet, explorer, indexer and minting script ends up re-implementing the
same small pieces: split a `policyId + assetName` unit, show `PATATE` instead
of `504154415445`, compute `asset1...` fingerprints, recognise a `(222)` NFT
and find its `(100)` reference token. This package does exactly that, in a few
kilobytes, with strict types and the official test vectors.

- **CIP-14 fingerprints** with a built-in BLAKE2b (RFC 7693), no crypto dependency.
- **CIP-67 labels** with the spec's CRC-8, verified against its lookup table and vectors.
- **CIP-68 helpers**: reference NFT ↔ user token (NFT, FT, RFT) name and unit conversion.
- **Safe display names**: strict UTF-8 decoding; control characters, bidi overrides and zero-width characters fall back to hex.
- **Typed errors**: one error class with a machine-readable `code`, plus non-throwing `try*` variants.
- **Tree-shakeable** ESM + CJS builds with bundled type declarations.

## Install

Not published to npm yet. Install a tagged release from GitHub (npm builds
the package during installation):

```sh
npm install github:gildor853/cardano-asset-name#v1.0.0
```

Requires Node.js 18+ or any modern browser/bundler.

The published package has no runtime dependencies and is verified on
Node.js 18 and 20 by a runtime smoke test in CI. Development (tests) needs
Node.js 22.12+, as required by vitest 5.

## Quick start

```ts
import {
  assetFingerprint,
  displayAssetName,
  parseAssetId,
  toReferenceUnit,
  withLabelUtf8,
} from "cardano-asset-name";

// Unit (policyId + assetNameHex) or dotted (policyId.assetNameHex) form.
const { policyId, assetName } = parseAssetId(
  "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373504154415445",
);
displayAssetName(assetName); // "PATATE"
assetFingerprint(policyId, assetName); // "asset13n25uv0yaf5kus35fm2k86cqy60z58d9xmde92"

// CIP-68: from the user NFT (222) to its reference NFT (100).
const policy = "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc";
const nft = policy + withLabelUtf8(222, "TestToken"); // "...000de14054657374546f6b656e"
displayAssetName(withLabelUtf8(222, "TestToken")); // "(222)TestToken"
toReferenceUnit(nft); // "d5e6...d4cc000643b054657374546f6b656e"
```

## API reference

### Asset IDs

| Function | Description |
| --- | --- |
| `parseAssetId(str, opts?)` | Parse the unit form `policyId + assetNameHex` (56–120 hex chars) or the dotted form `policyId.assetNameHex` into `{ policyId, assetName }` (lowercase hex). Option `format`: `"unit"`, `"dotted"` or `"any"` (default). |
| `tryParseAssetId(str, opts?)` / `isAssetId(str, opts?)` | Non-throwing / boolean variants. |
| `assetId(policyId, assetName?)` | Build a normalised `AssetId` from hex strings or bytes. |
| `toUnit(id)` / `toDotted(id)` | Format as `policyId + name` or `policyId.name` (an empty name prints as the bare policy ID, like `cardano-cli`). Accepts an object or a string in either form. |
| `normalizePolicyId(x)` / `isPolicyId(x)` | Validate a 28-byte policy ID (hex or `Uint8Array`). |
| `normalizeAssetName(x)` / `isAssetName(x)` | Validate a 0–32 byte asset name (hex or `Uint8Array`). |
| `POLICY_ID_LENGTH`, `MAX_ASSET_NAME_LENGTH` | `28` and `32` (bytes). |

### Asset name text

| Function | Description |
| --- | --- |
| `assetNameFromUtf8(text)` | Text → asset name hex; throws `InvalidAssetName` above 32 UTF-8 bytes. |
| `assetNameToUtf8(name)` / `tryAssetNameToUtf8(name)` | Strict UTF-8 decoding (overlong forms, surrogates, truncated sequences rejected). |
| `describeAssetName(name, opts?)` | `{ hex, label, content, utf8, display }`: detects a CIP-67 label, decodes the rest when it is printable UTF-8, otherwise falls back to hex. `display` uses CIP-68 notation, e.g. `"(222)TestToken"`. Options: `showLabel` (default `true`), `detectLabel` (default `true`). |
| `displayAssetName(name, opts?)` | Shorthand for `describeAssetName(...).display`. |
| `isPrintableText(text)` | `false` for empty text, control characters, bidi formatting controls and invisible zero-width characters (ZWJ is allowed for emoji). |
| `utf8ToBytes(str)` / `bytesToUtf8(bytes)` | The underlying UTF-8 codec. |

### CIP-14 fingerprints

| Function | Description |
| --- | --- |
| `assetFingerprint(policyId, assetName?)` / `assetFingerprint({ policyId, assetName })` | `bech32("asset", blake2b-160(policyId ‖ assetName))`. |
| `fingerprintFromUnit(unit)` | Same, from a unit or dotted asset ID string. |
| `decodeFingerprint(fp)` / `tryDecodeFingerprint(fp)` | Check prefix, checksum and length; returns the 20-byte digest. |
| `isAssetFingerprint(fp)` | Boolean variant. |
| `matchesFingerprint(fp, id)` | `true` if `fp` is the fingerprint of `id` (object or string). |
| `blake2b(data, digestLength = 64, key?)` | The BLAKE2b implementation (RFC 7693), 1–64 byte digests, optional key. |

A fingerprint is a hash: the policy ID and asset name cannot be recovered from
it. CIP-14 notes that collisions take about 2^80 work, so show the policy ID as
well when the distinction matters.

### CIP-67 labels

| Function | Description |
| --- | --- |
| `encodeLabel(n)` / `encodeLabelBytes(n)` | Label number (0–65535) → 4-byte prefix `[0000 \| label \| CRC-8 \| 0000]`, e.g. `222` → `"000de140"`. |
| `decodeLabel(label)` / `tryDecodeLabel(label)` / `isLabel(label)` | Exactly 4 bytes → number; checks brackets and checksum. |
| `getLabel(name)` | Label at the start of an asset name, or `null`. |
| `hasLabel(name, n?)` | Whether the name is labelled (optionally with a specific label). |
| `splitLabel(name)` | `{ label: number \| null, content }`. |
| `withLabel(n, contentHex?)` / `withLabelUtf8(n, text)` | Build a labelled asset name (content at most 28 bytes). |
| `crc8(bytes)` | CRC-8 with polynomial `0x07`, init `0x00` (as in CIP-67). |

### CIP-68

| Export | Description |
| --- | --- |
| `CIP68_LABELS` | `{ REFERENCE_NFT: 100, NFT: 222, FT: 333, RFT: 444 }`. |
| `cip68KindOf(label)` | `"reference-nft" \| "nft" \| "ft" \| "rft" \| null`. |
| `isCip68UserLabel(label)` | `true` for 222, 333, 444. |
| `parseCip68AssetName(name)` / `tryParseCip68AssetName(name)` | `{ label, kind, content }`; `MissingLabel` or `UnsupportedLabel` otherwise. |
| `isCip68AssetName(name, kind?)` | Boolean variant, optionally for one kind. |
| `toReferenceName(userName, opts?)` | `(222\|333\|444)content` → `(100)content`. `allowAnyLabel: true` accepts any non-100 label. |
| `toUserName(referenceName, userLabel)` | `(100)content` → `(userLabel)content`. The user label must be given: it cannot be inferred from the reference name. |
| `toReferenceUnit(id, opts?)` / `toUserUnit(id, userLabel)` | The same for whole asset IDs; return units. |

### Utilities

`bytesToHex(bytes)`, `hexToBytes(hex)`.

## Error handling

Throwing functions throw a single error class, `CardanoAssetError`, with a
machine-readable `code`:

| Code | Meaning |
| --- | --- |
| `InvalidHex` | Malformed hex (odd length or non-hex characters). |
| `InvalidPolicyId` | Policy ID is not 28 bytes. |
| `InvalidAssetName` | Asset name longer than 32 bytes (28 bytes of content after a label). |
| `InvalidAssetId` | Asset ID string with the wrong structure, length or format (or `"lovelace"`). |
| `InvalidUtf8` | Bytes are not valid UTF-8, or text contains a lone surrogate. |
| `InvalidLabel` | Label number out of range, or 4 bytes that are not a valid CIP-67 label. |
| `MissingLabel` | A CIP-68 operation on an asset name without a CIP-67 label. |
| `UnsupportedLabel` | A label that does not fit the CIP-68 operation (e.g. not 100/222/333/444). |
| `InvalidFingerprint` | Wrong prefix, checksum, case or digest length. |
| `InvalidArgument` | Invalid BLAKE2b parameters. |

```ts
import { parseCip68AssetName, tryParseAssetId, isCardanoAssetError } from "cardano-asset-name";

const name = "504154415445"; // "PATATE": no CIP-67 label
const input = "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373.504154415445";

try {
  parseCip68AssetName(name);
} catch (err) {
  if (isCardanoAssetError(err) && err.code === "MissingLabel") {
    // not a CIP-68 token
  }
}

const result = tryParseAssetId(input);
if (result.ok) {
  console.log(result.value.policyId);
} else {
  console.log(result.error.code);
}
result.ok; // true
```

Convention: `x()` throws, `tryX()` returns `{ ok: true, value } | { ok: false, error }`,
`isX()` returns a boolean.

## Specifications and test vectors

- [CIP-14](https://github.com/cardano-foundation/CIPs/tree/master/CIP-0014): all eight official fingerprint vectors.
- [CIP-67](https://github.com/cardano-foundation/CIPs/tree/master/CIP-0067): all ten label vectors, the worked `222` example and the full CRC-8 lookup table; every label 0–65535 round-trips.
- [CIP-68](https://github.com/cardano-foundation/CIPs/tree/master/CIP-0068): the asset name examples (`(100)GenToken`, `(100)NeverGonna`, `(222)GiveYouUp`) and the reference/user token examples.
- [RFC 7693](https://www.rfc-editor.org/rfc/rfc7693): BLAKE2b-512(`"abc"`) from Appendix A and the Appendix E self-test (digest lengths 20/32/48/64, keyed and unkeyed), plus cross-checks against `node:crypto`.

## Limitations and assumptions

- **Hex is the canonical form** of policy IDs and asset names; output is always
  lowercase. Inputs may be uppercase hex or `Uint8Array`.
- **`"lovelace"`** (ada) is not a native asset and is rejected by `parseAssetId`.
- **Display names** are a heuristic: a name that happens to be valid printable
  UTF-8 is shown as text. Never use the display name to identify an asset; use
  the policy ID and asset name (or at least the fingerprint).
- **Label detection** only proves that a name *follows the CIP-67 format*. A
  labelled name says nothing about whether the token actually follows CIP-68
  (for example, that a reference NFT exists or holds a valid datum).
- **CIP-68 metadata** (the datum of the reference NFT) is out of scope.
- **BLAKE2b** is a straightforward, non-constant-time implementation intended
  for hashing public data such as asset IDs. It processes the input in one shot
  (no streaming API).

## Disclaimer

**Use at your own risk.** This software is provided as is, without warranty of any kind. Mistakes can affect real assets; this is not financial advice. Verify policy IDs and fingerprints independently. See the full legal text in [DISCLAIMER.md](./DISCLAIMER.md).

## Contributing

This repository is maintained by a single author and does not accept external
contributions; issues and pull requests are limited to collaborators.

Security problems can be reported privately, see [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © 2026 Gildor
