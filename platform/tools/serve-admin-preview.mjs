#!/usr/bin/env node
/**
 * Serve the admin preview.
 *
 *   node platform/tools/serve-admin-preview.mjs [port]
 *   → http://0.0.0.0:8080
 *
 * Why this and not `php artisan serve`: the Livewire admin lives inside the OS clone and needs
 * PHP, Composer and MySQL. This repository carries only the new platform files, so there is no
 * application to boot here — what can run is the preview that `make-admin-preview.mjs` writes,
 * which is the same fourteen screens, the same words and the same seeded numbers, in one file.
 *
 * The server is deliberately dumb: a directory, an index, and the right content types. It binds
 * to 0.0.0.0 and never inspects the Host header, so it works behind a proxy on any domain —
 * which is exactly how a preview gets shown to somebody who is not on this machine.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "docs", "07-woodex-os", "preview");

const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const host = "0.0.0.0";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
};

/** Resolve a URL to a file inside `root`, or null. Path traversal is refused, not normalised away. */
async function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const relative = clean === "/" ? "admin.html" : clean.replace(/^\/+/, "");
  const path = normalize(join(root, relative));

  if (!path.startsWith(normalize(root))) {
    return null;
  }

  try {
    const info = await stat(path);
    if (info.isDirectory()) {
      return resolve(join(clean.replace(/\/$/, ""), "index.html"));
    }
    return path;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const path = await resolve(request.url ?? "/");

  if (path === null) {
    response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      '<!doctype html><meta charset="utf-8"><title>Not here</title>' +
        '<body style="font:15px/1.6 system-ui;padding:48px;color:#334155">' +
        '<h1 style="font-size:20px">Nothing at that path</h1>' +
        '<p>The admin preview is a single page. <a href="/">Open it here.</a></p>',
    );
    return;
  }

  try {
    const body = await readFile(path);

    response.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
      "Content-Length": body.length,
      // The preview changes whenever the seed changes; a stale copy in a browser is a
      // support question about a number that no longer exists.
      "Cache-Control": "no-cache, must-revalidate",
    });

    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Could not read that file.");
  }
});

server.listen(port, host, () => {
  console.log(`admin preview → http://${host}:${port}`);
  console.log(`serving ${root}`);
});
