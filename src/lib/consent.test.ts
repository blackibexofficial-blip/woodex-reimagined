import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_VERSION, collectAttribution, buildConsent } from "./consent";

test("version is stable and referenced by the storefront + EF", () => {
  assert.equal(CONSENT_VERSION, "lead-privacy-v1");
});

test("collectAttribution parses utm trio and clips to contract widths", () => {
  const a = collectAttribution("?utm_source=google&utm_medium=cpc&utm_campaign=" + "x".repeat(500), "/contact", "https://google.com/q=1");
  assert.equal(a.utmSource, "google");
  assert.equal(a.utmMedium, "cpc");
  assert.equal(a.utmCampaign?.length, 80);
  assert.equal(a.landingPath, "/contact");
  assert.equal(a.referrer, "https://google.com/q=1");
});

test("collectAttribution tolerates hostile/empty input", () => {
  const a = collectAttribution("???", null, null);
  assert.deepEqual(Object.values(a), [null, null, null, null, null]);
  const b = collectAttribution("?utm_source=%", "  ", "  ");
  assert.equal(b.utmSource, "%"); // harmless 2-char leftover, (clipped)
  assert.equal(b.landingPath, null);
});

test("buildConsent emits the exact contract the EF requires", () => {
  const c = buildConsent(new Date("2026-11-07T12:00:00.000Z"));
  assert.equal(c.consent, true);
  assert.equal(c.consentVersion, CONSENT_VERSION);
  assert.equal(c.consentAt, "2026-11-07T12:00:00.000Z");
});
