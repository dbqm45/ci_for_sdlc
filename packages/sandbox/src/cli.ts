import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { noConnectionHint } from '../../../scripts/lib/sandbox-atlassian.mjs';
import { mutate, reset, seed, status, type Outcome } from './kits/index.js';
import { connect, loadState, SandboxError, saveState, type Env, type LiveContext, type SandboxState } from './live/context.js';

/**
 * Seeder command line (docs/TEST-DATA-GENERATOR.md, 4.3):
 *   sandbox:seed | sandbox:mutate <scenario> | sandbox:reset   [--confirm]   — a dry run without --confirm
 *   sandbox:status                                                           — read tokens only
 */

const USAGE = 'usage: cli.ts seed|reset [--confirm] | mutate <scenario> [--confirm] | status';
const STATE_FILE = resolve('.sandbox/state.json');

export interface CliResult { code: number; lines: string[] }

export async function main(argv: string[], env: Env, opts: { log?: (line: string) => void; file?: string; fetchImpl?: Parameters<typeof connect>[1]['fetchImpl']; sleep?: (ms: number) => Promise<void> } = {}): Promise<CliResult> {
  const lines: string[] = [];
  const out = opts.log ?? ((line: string) => lines.push(line));
  const file = opts.file ?? STATE_FILE;
  const flags = argv.filter((a) => a.startsWith('--'));
  const [command, ...args] = argv.filter((a) => !a.startsWith('--'));
  const unknown = flags.filter((f) => f !== '--confirm' && f !== '--dry-run');
  if (!command || !['seed', 'mutate', 'reset', 'status'].includes(command) || unknown.length || (command === 'mutate') !== (args.length === 1) || (command !== 'mutate' && args.length)) {
    out(USAGE);
    return { code: 2, lines };
  }
  if (flags.includes('--confirm') && flags.includes('--dry-run')) {
    out('--confirm and --dry-run exclude each other');
    return { code: 2, lines };
  }
  const write = command !== 'status' && flags.includes('--confirm');

  let ctx: LiveContext | undefined;
  let state: SandboxState | undefined;
  let outcome: Outcome | undefined;
  const early: string[] = [];
  try {
    ctx = await connect(env, { write, log: out, fetchImpl: opts.fetchImpl, sleep: opts.sleep });
    state = loadState(file, ctx.site, (w) => early.push(w));
    ctx.warnings.push(...early);
    if (command === 'seed') outcome = await seed(ctx, state);
    else if (command === 'mutate') outcome = await mutate(ctx, state, args[0]!);
    else if (command === 'reset') outcome = await reset(ctx, state);
    else outcome = await status(ctx, state);
  } catch (e) {
    const problems = e instanceof SandboxError ? e.problems : [message(e, env)];
    finish(out, ctx, problems, []);
    // What was written before the failure stays in the state, so the next run knows it.
    if (ctx?.write && state) saveState(file, state);
    return { code: 1, lines };
  }

  if (write || command === 'status') saveState(file, outcome.state);
  finish(out, ctx, outcome.problems, outcome.report);
  if (!write && command !== 'status' && ctx.actions.length) out('\nDry run — nothing was changed. Run again with --confirm to apply.');
  return { code: outcome.problems.length ? 1 : 0, lines };
}

function message(e: unknown, env: Env): string {
  const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0]!;
  return msg === 'fetch failed' ? noConnectionHint(env) : msg;
}

function finish(out: (line: string) => void, ctx: LiveContext | undefined, problems: string[], report: string[]): void {
  if (ctx?.actions.length) {
    out('');
    for (const a of ctx.actions) out(`• ${a}`);
  }
  if (ctx?.warnings.length) {
    out('');
    for (const w of ctx.warnings) out(`! ${w}`);
  }
  if (report.length) {
    out('');
    for (const r of report) out(r);
  }
  if (problems.length) {
    out('');
    for (const p of problems) out(`✗ ${p}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { code } = await main(process.argv.slice(2), process.env, { log: (line) => console.log(line) });
  process.exitCode = code;
}
