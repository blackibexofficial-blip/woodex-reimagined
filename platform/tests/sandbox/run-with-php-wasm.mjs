/**
 * Run the commerce test suite through PHP 8.4 compiled to WebAssembly.
 *
 *   npm install php-wasm
 *   node run-with-php-wasm.mjs [filter]
 *
 * Why this exists: the money pipeline must be runnable on a machine that has no PHP
 * binary and no Composer — a Chromebook, a CI runner before the toolchain is installed,
 * or the sandbox this code was first written in. It also runs the suite on a 32-bit PHP,
 * which is a genuinely useful stress test for integer arithmetic.
 *
 * Files are handed to PHP in one bundle and written inside the virtual filesystem, because
 * the per-file write API is unreliable for nested paths.
 */
import { PhpNode } from 'php-wasm/PhpNode.mjs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..'); // platform/

const php = new PhpNode();
let output = '';
php.addEventListener('output', (event) => { output += event.detail.join(''); });

const walk = (dir, files = []) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules' || name === 'sandbox') continue;
      walk(path, files);
    } else if (/\.(php|json|ts|tsx)$/.test(name)) {
      // TypeScript is included so the wiring tests can assert that the studio reads the same
      // registry and the same data attributes the Blade shell writes. They are a few kilobytes;
      // a test that cannot see the other half of a contract is a test that proves nothing.
      files.push(path);
    }
  }
  return files;
};

const bundle = {};
for (const file of walk(root)) {
  bundle['/app/' + relative(root, file)] = readFileSync(file, 'utf8');
}

await php.writeFile('/bundle.json', JSON.stringify(bundle));

const filter = process.argv[2] ?? null;
const code = `<?php
foreach (json_decode(file_get_contents('/bundle.json'), true) as $path => $content) {
    if (! is_dir(dirname($path))) { mkdir(dirname($path), 0777, true); }
    file_put_contents($path, $content);
}
$argv = array(0 => 'run.php', 1 => ${JSON.stringify(filter)});
require '/app/tests/run.php';
`;

const exitCode = await php.run(code);
process.stdout.write(output);
process.exit(typeof exitCode === 'number' ? exitCode : 0);
