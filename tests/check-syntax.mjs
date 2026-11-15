// Parses every script in the project without running it, so browser-only files are covered too.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  ...readdirSync('js').filter(f => f.endsWith('.js')).map(f => `js/${f}`),
  ...readdirSync('bridge').filter(f => f.endsWith('.mjs')).map(f => `bridge/${f}`),
];
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) { failed++; console.error(`✗ ${file}\n${r.stderr}`); }
}
console.log(`Syntax: ${files.length - failed}/${files.length} files OK`);
process.exit(failed ? 1 : 0);
