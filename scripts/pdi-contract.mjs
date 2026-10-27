#!/usr/bin/env node
// Copies of the pdi contract, pinned in scripts/pdi-contract.json and generated from their source (never edited here).
//
//   npm run contract:sync    — fetch every pinned file from dbqm45/pdi (tag contract-v<version> or pinned commit) and
//                              write the copies
//   npm run contract:check   — compare the copies byte for byte; exit 1 and list the differences (CI runs this)
//
// Options: --pin FILE (default scripts/pdi-contract.json), --root DIR (default: repository root), --source DIR (a local
// contract/ directory instead of the network; tests and offline work). To update: change the version in the pin file,
// run contract:sync, run the tests, open a PR.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePin, planCopies, sourceUrl } from './lib/pdi-contract.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function args(argv) {
  const [cmd, ...rest] = argv;
  const opts = { cmd, pin: join(ROOT, 'scripts/pdi-contract.json'), root: ROOT, source: undefined };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.replace(/^--/, '');
    if (!['pin', 'root', 'source'].includes(key) || rest[i + 1] === undefined) throw new Error(`Nieznana opcja: ${rest[i]}`);
    opts[key] = rest[i + 1];
  }
  if (!['sync', 'check'].includes(cmd)) throw new Error('Użycie: pdi-contract.mjs sync|check [--pin FILE] [--root DIR] [--source DIR]');
  return opts;
}

async function read(repo, copy, source) {
  if (source) {
    const file = join(source, copy.name);
    return existsSync(file) ? readFileSync(file) : null;
  }
  const res = await fetch(sourceUrl(repo, copy.ref, copy.name));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${copy.ref}/${copy.name}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  let opts;
  let pin;
  try {
    opts = args(process.argv.slice(2));
    pin = parsePin(JSON.parse(readFileSync(opts.pin, 'utf8')));
  } catch (e) {
    console.error(`✗ ${e.message}`);
    return 2;
  }
  const copies = planCopies(pin);
  const where = opts.source ?? `dbqm45/pdi (tag lub commit z przypięcia)`;
  const missing = [];
  const differ = [];
  for (const copy of copies) {
    const want = await read(pin.repo, copy, opts.source);
    if (want === null) {
      missing.push(`${copy.ref}: ${copy.name}`);
      continue;
    }
    const dest = join(opts.root, copy.dest);
    if (opts.cmd === 'sync') {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, want);
    } else if (!existsSync(dest) || !readFileSync(dest).equals(want)) {
      differ.push(copy.dest);
    }
  }
  if (missing.length) {
    console.error(`✗ brak w źródle (${where}):\n${missing.map((m) => `  - ${m}`).join('\n')}`);
    return 1;
  }
  if (differ.length) {
    console.error(`✗ kopie różne od kontraktu pdi — nie edytuj ich ręcznie, uruchom \`npm run contract:sync\`:\n${differ.map((d) => `  - ${d}`).join('\n')}`);
    return 1;
  }
  console.log(`✓ ${copies.length} kopii kontraktu pdi ${opts.cmd === 'sync' ? 'zapisanych' : 'zgodnych'} (${where})`);
  return 0;
}

process.exitCode = await main();
