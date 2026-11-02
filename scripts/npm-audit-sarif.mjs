#!/usr/bin/env node
// `npm audit --json` as SARIF 2.1.0 for `npm run analyze -- --sarif` (docs/SECURITY-SCAN-PLAN.md):
//
//   npm audit --json > reports/audit.json || true
//   node scripts/npm-audit-sarif.mjs reports/audit.json reports/security/npm-audit.sarif [--lockfile package-lock.json]
//
// Input that is not an audit report (npm failed, no lockfile, not JSON) exits 1 and writes nothing, so the gate reports a
// missing scan instead of a clean one. Paths are relative to the current directory; the lockfile path is kept as given.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AuditError, auditToSarif } from './lib/npm-audit-sarif.mjs';

function main(argv) {
  const pos = [];
  let lockfile = 'package-lock.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lockfile' && argv[i + 1]) lockfile = argv[++i];
    else pos.push(argv[i]);
  }
  if (pos.length !== 2) throw new AuditError('Usage: npm-audit-sarif.mjs <audit.json> <output.sarif> [--lockfile package-lock.json]');
  const [input, output] = pos;
  let audit;
  try {
    audit = JSON.parse(readFileSync(input, 'utf8'));
  } catch (e) {
    throw new AuditError(e?.code === 'ENOENT' ? `Cannot read ${input}` : `${input}: Not JSON`);
  }
  const sarif = auditToSarif(audit, existsSync(lockfile) ? { lockfile: { path: lockfile, text: readFileSync(lockfile, 'utf8') } } : {});
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(sarif, null, 2)}\n`);
  console.log(`npm audit → ${output}: ${sarif.runs[0].results.length} result(s)`);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(`✗ ${e instanceof AuditError ? e.message : String(e)}`);
  process.exit(1);
}
