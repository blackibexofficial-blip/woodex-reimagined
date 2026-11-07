// node --test supabase/functions/_shared/turnstile.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstileToken } from "./turnstile.mjs";

const mockFetch = (impl) => async (...args) => impl(...args);
const jsonResp = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("success + matching action -> ok", async () => {
  const r = await verifyTurnstileToken({
    secret: "s", token: "tok", remoteip: "203.0.113.7", action: "order",
    fetchImpl: mockFetch(async () => jsonResp({ success: true, action: "order" })),
  });
  assert.equal(r.ok, true);
});

test("missing token -> 403 without calling siteverify", async () => {
  let called = 0;
  const r = await verifyTurnstileToken({
    secret: "s", token: undefined, action: "order",
    fetchImpl: mockFetch(async () => { called += 1; return jsonResp({ success: true }); }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(called, 0);
});

test("success false -> 403", async () => {
  const r = await verifyTurnstileToken({
    secret: "s", token: "tok", action: "lead",
    fetchImpl: mockFetch(async () => jsonResp({ success: false, "error-codes": ["invalid-input-response"] })),
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("action mismatch (lead token replayed at checkout) -> 403", async () => {
  const r = await verifyTurnstileToken({
    secret: "s", token: "tok", action: "order",
    fetchImpl: mockFetch(async () => jsonResp({ success: true, action: "lead" })),
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("siteverify HTTP 500 -> 503 (fail-closed)", async () => {
  const r = await verifyTurnstileToken({
    secret: "s", token: "tok", action: "order",
    fetchImpl: mockFetch(async () => jsonResp({}, 500)),
  });
  assert.equal(r.status, 503);
});

test("siteverify transport error -> 503 (fail-closed)", async () => {
  const r = await verifyTurnstileToken({
    secret: "s", token: "tok", action: "order",
    fetchImpl: mockFetch(async () => { throw new Error("ENETUNREACH"); }),
  });
  assert.equal(r.status, 503);
});

test("siteverify non-JSON -> 503 (fail-closed)", async () => {
  const r = await verifyTurnstileToken({
    secret: "s", token: "tok", action: "order",
    fetchImpl: mockFetch(async () => new Response("<html>bad gateway</html>", { status: 200 })),
  });
  assert.equal(r.status, 503);
});

test("form body carries secret, token and remoteip", async () => {
  let seen;
  await verifyTurnstileToken({
    secret: "sekret", token: "tok123", remoteip: "198.51.100.9", action: "order",
    fetchImpl: mockFetch(async (url, init) => { seen = { url, body: init.body }; return jsonResp({ success: true }); }),
  });
  assert.match(seen.url, /siteverify$/);
  const params = new URLSearchParams(seen.body);
  assert.equal(params.get("secret"), "sekret");
  assert.equal(params.get("response"), "tok123");
  assert.equal(params.get("remoteip"), "198.51.100.9");
});
