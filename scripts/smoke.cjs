// Runtime smoke test of the built package (CJS entry). See smoke.mjs.
"use strict";
const assert = require("node:assert/strict");
const { assetFingerprint, tryParseAssetId, decodeLabel, CardanoAssetError } = require("cardano-asset-name");

// CIP-14 test vector.
assert.equal(
  assetFingerprint("1e349c9bdea19fd6c147626a5260bc44b71635f398b67c59881df209"),
  "asset1uyuxku60yqe57nusqzjx38aan3f2wq6s93f6ea",
);
assert.equal(decodeLabel("0ffff240"), 65535); // CIP-67 test vector
const bad = tryParseAssetId("lovelace");
assert.equal(bad.ok, false);
assert.ok(bad.error instanceof CardanoAssetError);
assert.equal(bad.error.code, "InvalidAssetId");

console.log(`CJS smoke test passed on Node ${process.version}`);
