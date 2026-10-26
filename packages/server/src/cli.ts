/**
 * Headless quality gate — "Semantic CI/CD" for product definition. Options and exit codes: gate.ts.
 *
 *   npm run analyze -- --fail-on critical             # exit 1 if any item is NOT READY (use in CI pipelines)
 *   npm run analyze -- --repo . --fail-on critical    # a pull request's docs/project/changes (F2)
 */
import { runGate } from './gate.js';

process.exitCode = await runGate(process.argv.slice(2), {
  env: process.env,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
