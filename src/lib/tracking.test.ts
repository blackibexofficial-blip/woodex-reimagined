import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateTrackingToken,
  hashTrackingToken,
  timingSafeEqualHex,
  isWellFormedRef,
  isOrderStage,
  ORDER_STAGES,
} from "./tracking";

test("hashTrackingToken is deterministic and sha256-hex shaped", async () => {
  const h1 = await hashTrackingToken("example-token");
  const h2 = await hashTrackingToken("example-token");
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("different tokens hash differently", async () => {
  const a = await hashTrackingToken("token-a");
  const b = await hashTrackingToken("token-b");
  assert.notEqual(a, b);
});

test("generated token: 43 unpadded base64url chars, unique across calls", async () => {
  const t1 = await generateTrackingToken();
  const t2 = await generateTrackingToken();
  assert.match(t1, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(t1, t2);
});

test("timingSafeEqualHex: match, mismatch, malformed", () => {
  const h = "a".repeat(64);
  assert.equal(timingSafeEqualHex(h, "a".repeat(64)), true);
  assert.equal(timingSafeEqualHex(h, "b".repeat(64)), false);
  assert.equal(timingSafeEqualHex(h, "a".repeat(63)), false);
  assert.equal(timingSafeEqualHex(h, "zz".repeat(32)), false); // non-hex
});

test("isWellFormedRef gates only our own reference shape", () => {
  assert.equal(isWellFormedRef("WX-1001"), true);
  assert.equal(isWellFormedRef("WX-2030-XYZ9"), true);
  assert.equal(isWellFormedRef("wx-1001"), false);
  assert.equal(isWellFormedRef("1001"), false);
  assert.equal(isWellFormedRef("WX-" + "A".repeat(40)), false);
});

test("stage vocabulary matches the migration check constraint", () => {
  for (const s of ORDER_STAGES) assert.equal(isOrderStage(s), true);
  assert.equal(isOrderStage("shipped-ish"), false);
  assert.equal(isOrderStage(""), false);
});
