import { execFile } from 'node:child_process';
import { errorMessage, mergeSuiteDecisions, selectSuiteDecisions, type SuiteDecision, type SuiteDecisionCache } from '@ci/core';
import type { Store } from './store.js';

/**
 * D9 (docs/PDI-D9-PLAN.md): the read-only copy of the suite decision index in pdi, refreshed from `pdi-records changes`
 * (pdi D7) run as CI_SUITE_DECISIONS_CMD (e.g. `uv run --directory /srv/pdi pdi-records`). The command is split like a
 * shell would and run without one; the pdi service's HTTP API (DA4) will replace it behind `fetchPage`. A failure keeps
 * the last copy and records why (never the command's output). The copy is the installation's, kept with `default`.
 */

export interface SuiteDecisionsOptions {
  /** The command; empty = off. Defaults to CI_SUITE_DECISIONS_CMD. */
  cmd?: string;
  env?: NodeJS.ProcessEnv;
  clock?: () => Date;
  /** Decisions per page (`--limit`). */
  pageSize?: number;
  /** The whole refresh at most this long. */
  budgetMs?: number;
}

export interface SuiteDecisionsStatus {
  enabled: boolean;
  fetchedAt?: string;
  /** Why the last refresh failed: the copy is stale. */
  error?: string;
  count: number;
}

const MAX_PAGES = 50;
const MAX_OUTPUT = 32 * 1024 * 1024;

/** Splits a command line into arguments: spaces separate, '…' and "…" group, \ escapes; nothing is expanded. */
export function splitCommand(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | undefined;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = undefined;
      else if (c === '\\' && quote === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === '\\' && i + 1 < line.length) {
      cur += line[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = '';
      has = false;
    } else cur += c;
  }
  if (has || cur) out.push(cur);
  return out;
}

export class SuiteDecisions {
  private readonly argv: string[];
  private readonly env: NodeJS.ProcessEnv;
  private readonly clock: () => Date;
  private readonly pageSize: number;
  private readonly budgetMs: number;
  private running?: Promise<{ ok: boolean }>;

  constructor(
    private readonly store: Store,
    opts: SuiteDecisionsOptions = {},
  ) {
    this.argv = splitCommand(opts.cmd ?? process.env.CI_SUITE_DECISIONS_CMD ?? '');
    this.env = opts.env ?? process.env;
    this.clock = opts.clock ?? (() => new Date());
    this.pageSize = opts.pageSize ?? 200;
    this.budgetMs = opts.budgetMs ?? 20_000;
  }

  get enabled() {
    return this.argv.length > 0;
  }

  /** Brings the copy up to date; one refresh at a time (a second caller shares the running one). Never throws. */
  refresh(): Promise<{ ok: boolean }> {
    if (!this.enabled) return Promise.resolve({ ok: false });
    this.running ??= this.refreshNow().finally(() => (this.running = undefined));
    return this.running;
  }

  async status(): Promise<SuiteDecisionsStatus> {
    if (!this.enabled) return { enabled: false, count: 0 };
    const c = await this.store.suiteDecisions();
    return { enabled: true, ...(c.fetchedAt && { fetchedAt: c.fetchedAt }), ...(c.error && { error: c.error }), count: c.decisions.length };
  }

  /** The decisions of a change and/or matching the words, with the state of the copy; nothing when off. */
  async find(f: { change?: string; q?: string }): Promise<SuiteDecisionsStatus & { decisions: SuiteDecision[] }> {
    if (!this.enabled) return { enabled: false, count: 0, decisions: [] };
    const [status, c] = await Promise.all([this.status(), this.store.suiteDecisions()]);
    return { ...status, decisions: selectSuiteDecisions(c.decisions, f) };
  }

  private async refreshNow(): Promise<{ ok: boolean }> {
    const deadline = Date.now() + this.budgetMs;
    let cursor = (await this.store.suiteDecisions()).next;
    const pages: { decisions: unknown[]; next?: string }[] = [];
    try {
      for (let n = 0; ; n++) {
        if (n >= MAX_PAGES) throw new Error('too many pages');
        const page = await this.fetchPage(cursor, deadline - Date.now());
        pages.push(page);
        cursor = page.next ?? cursor;
        if (page.complete) break;
      }
    } catch (e) {
      const error = errorMessage(e).slice(0, 300);
      await this.store.updateSuiteDecisions((c) => ({ ...c, error }));
      return { ok: false };
    }
    const at = this.clock().toISOString();
    await this.store.updateSuiteDecisions((c) => pages.reduce<SuiteDecisionCache>((acc, p) => mergeSuiteDecisions(acc, p.decisions, p.next, at), c));
    return { ok: true };
  }

  /** One page of `pdi-records changes`; throws with a short reason (exit code, time, bad answer). */
  private fetchPage(since: string | undefined, timeoutMs: number): Promise<{ decisions: unknown[]; next?: string; complete: boolean }> {
    if (timeoutMs <= 0) return Promise.reject(new Error('refresh took too long'));
    const [file, ...base] = this.argv;
    const args = [...base, 'changes', ...(since ? ['--since', since] : []), '--limit', String(this.pageSize)];
    return new Promise((resolve, reject) => {
      execFile(file!, args, { env: this.env, timeout: timeoutMs, maxBuffer: MAX_OUTPUT, windowsHide: true }, (err, stdout) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
          return reject(new Error(e.killed ? 'refresh took too long' : typeof e.code === 'number' ? `pdi-records changes exited ${e.code}` : `pdi-records could not start (${String(e.code ?? 'error')})`));
        }
        try {
          const a = JSON.parse(stdout) as { decisions?: unknown; next?: unknown; complete?: unknown };
          if (!Array.isArray(a.decisions)) throw new Error('no decisions');
          resolve({ decisions: a.decisions, ...(typeof a.next === 'string' && { next: a.next }), complete: a.complete !== false });
        } catch {
          reject(new Error('pdi-records changes gave an answer that is not JSON of the expected shape'));
        }
      });
    });
  }
}
