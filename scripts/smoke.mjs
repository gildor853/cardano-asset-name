// Runtime smoke test of the built package (ESM entry), run by CI on Node
// versions the test runner no longer supports. No dependencies, no network.
// The bare specifier resolves to ./dist through the package's "exports" map.
import assert from "node:assert/strict";
import {
  assetFingerprint,
  blake2b,
  bytesToHex,
  displayAssetName,
  encodeLabel,
  fingerprintFromUnit,
  parseAssetId,
  toReferenceUnit,
} from "cardano-asset-name";

// CIP-14 test vector.
const policy = "7eae28af2208be856f7a119668ae52a49b73725e326dc16579dcc373";
assert.equal(assetFingerprint(policy, "504154415445"), "asset13n25uv0yaf5kus35fm2k86cqy60z58d9xmde92");
assert.equal(fingerprintFromUnit(`${policy}.504154415445`), "asset13n25uv0yaf5kus35fm2k86cqy60z58d9xmde92");
// RFC 7693 Appendix A.
assert.equal(
  bytesToHex(blake2b(Uint8Array.of(0x61, 0x62, 0x63))),
  "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923",
);
// CIP-67 test vector and CIP-68 example.
assert.equal(encodeLabel(11111), "02b670b0");
const user = "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc000de14054657374546f6b656e";
assert.deepEqual(parseAssetId(user).assetName, "000de14054657374546f6b656e");
assert.equal(displayAssetName("000de14054657374546f6b656e"), "(222)TestToken");
assert.equal(
  toReferenceUnit(user),
  "d5e6bf0500378d4f0da4e8dde6becec7621cd8cbf5cbb9b87013d4cc000643b054657374546f6b656e",
);

console.log(`ESM smoke test passed on Node ${process.version}`);
