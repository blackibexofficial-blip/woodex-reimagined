/**
 * Shared E2E bootstrap: serve the production build on :4173 and launch a
 * headless chromium (@sparticuz/chromium — works offline on a laptop AND in CI,
 * no browser download step needed).
 *
 * Usage:
 *   import { withServer, launchBrowser } from "./lib.mjs";
 *   await withServer(async () => { const browser = await launchBrowser(); … });
 */
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { default as chromium, inflate, setupLambdaEnvironment } from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BASE = "http://localhost:4173";
export const ADMIN = `${BASE}/admin`;

export async function launchBrowser() {
  const binPath = path.join(path.dirname(fileURLToPath(import.meta.resolve("@sparticuz/chromium"))), "..", "bin");
  await inflate(path.join(binPath, "al2023.tar.br")).catch(() => {});
  setupLambdaEnvironment(path.join(tmpdir(), "al2023", "lib"));
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1440, height: 940 },
    protocolTimeout: 90000,
  });
}

async function waitForServer(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`preview server did not come up at ${url}: ${lastErr ?? "timeout"}`);
}

/**
 * Ensures dist/ exists (builds when missing), starts `vite preview` bound to
 * 0.0.0.0:4173 (kept off 8080 so the dev server / live preview keeps running), waits for it, runs `fn`, and always tears the server down.
 */
export async function withServer(fn) {
  if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
    console.log("[e2e] dist/ missing — running `bun run build` first…");
    const build = spawn("bun", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
    await new Promise((resolve, reject) => build.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`)))));
  }

  const server = spawn("bun", ["run", "vite", "preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));

  let code = 1;
  try {
    await waitForServer(BASE);
    code = await fn();
  } catch (err) {
    console.error("[e2e] fatal:", err?.message ?? err);
    if (serverLog.trim()) console.error("[e2e] vite preview log:\n" + serverLog.trim());
    code = 1;
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    server.kill("SIGKILL");
  }
  return code;
}

/** Collect console/page errors into an array (filter infrastructure noise). */
export function watchErrors(page) {
  const logs = [];
  const noise = /favicon|net::|ERR_CONNECTION_CLOSED|fonts\.googleapis|fonts\.gstatic|Download the React DevTools/i;
  page.on("console", (m) => { if (m.type() === "error" && !noise.test(m.text())) logs.push(`[console:error] ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  return logs;
}
