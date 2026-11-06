#!/usr/bin/env node
/**
 * Emit GitHub Actions annotations for failing E2E checks so the failure text
 * is visible via the check-run annotations API (sandboxed agents often cannot
 * download job logs, but annotations ARE readable).
 *
 * Usage: node e2e/annotate.mjs <log-file>
 */
import fs from "node:fs";

const file = process.argv[2];
if (file && fs.existsSync(file)) {
  const esc = (s) =>
    s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, ":");
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const interesting = lines.filter((l) => /(^|\s)(FAIL|\[e2e\] fatal)/i.test(l)).slice(0, 20);
  if (interesting.length === 0) {
    interesting.push("smoke exited non-zero but no FAIL line was captured — see raw step log");
  }
  for (const line of interesting) {
    process.stdout.write(`::error title=E2E failure::${esc(line.trim())}\n`);
  }
}
