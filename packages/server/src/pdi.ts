import { createHmac, timingSafeEqual } from 'node:crypto';
import { changeReadiness, errorMessage, readinessEvents, type AnalysisResult, type RequirementItem } from '@ci/core';
import type { PdiOutboxEntry, Store } from './store.js';

/**
 * Link with pdi (F4, docs/PDI-F4-PLAN.md). Out: `readiness.changed` per change to `PDI_EVENTS_URL/events/ci_for_sdlc`
 * (pdi-receiver). In: `gate.decided` on `POST /api/webhooks/pdi`. Both ways the same signature, as pdi-receiver
 * checks it: `X-PDI-Signature: v1=<hex HMAC-SHA256(PDI_SIGNING_SECRET, "<X-PDI-Timestamp>.<raw body>")>`.
 */

export interface PdiOptions {
  /** Base URL of pdi-receiver; defaults to PDI_EVENTS_URL. */
  eventsUrl?: string;
  /** Shared with pdi (its PDI_CI_FOR_SDLC_SIGNING_SECRET); defaults to PDI_SIGNING_SECRET. */
  secret?: string;
  fetch?: typeof fetch;
  clock?: () => Date;
}

export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const MAX_ATTEMPTS = 10;
const MAX_BACKOFF_SECONDS = 3600;
const TIMEOUT_MS = 10_000;

export const pdiSignature = (secret: string, timestamp: string, body: string) => `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

/** Null when the signature and its timestamp are valid, else why not (never echoing what was sent). */
export function pdiSignatureProblem(secret: string, timestamp: string | undefined, body: string, signature: string | undefined, now: Date): string | null {
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return 'Missing or invalid X-PDI-Timestamp';
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return 'The signature timestamp is too old or in the future';
  const expected = pdiSignature(secret, timestamp, body);
  if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return 'Invalid X-PDI-Signature';
  return null;
}

/** https, or http only for a loopback host (local pdi-receiver). */
function usableUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    return u.protocol === 'https:' || (u.protocol === 'http:' && loopback) ? raw.replace(/\/+$/, '') : undefined;
  } catch {
    return undefined;
  }
}

export class PdiLink {
  readonly eventsUrl?: string;
  readonly secret?: string;
  private readonly fetch: typeof fetch;
  private readonly clock: () => Date;
  private delivering?: Promise<void>;
  /** Queueing scheduled after analyses, in order; delivery waits for it. */
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    private store: Store,
    opts: PdiOptions = {},
    env: Record<string, string | undefined> = process.env,
  ) {
    this.eventsUrl = usableUrl(opts.eventsUrl ?? env.PDI_EVENTS_URL);
    this.secret = (opts.secret ?? env.PDI_SIGNING_SECRET) || undefined;
    this.fetch = opts.fetch ?? fetch;
    this.clock = opts.clock ?? (() => new Date());
  }

  /** Sending needs both the receiver's address and the secret; receiving only the secret. */
  get enabled() {
    return !!(this.eventsUrl && this.secret);
  }

  now() {
    return this.clock();
  }

  /** After an analysis: queue `readiness.changed` for every change whose readiness differs from the last one sent. */
  async enqueue(result: AnalysisResult, requirements: RequirementItem[], prefix?: string) {
    if (!this.enabled) return;
    const now = this.clock().toISOString();
    let events: ReturnType<typeof readinessEvents>['events'] = [];
    await this.store.updatePdiState((s) => {
      const r = readinessEvents(changeReadiness(result.items, requirements, prefix || undefined), s.sent ?? {}, now);
      events = r.events;
      return { ...s, sent: r.sent, seen: s.seen ?? [] };
    });
    if (events.length) await this.store.updatePdiOutbox((all) => [...all, ...events.map((event) => ({ event, attempts: 0, nextAt: now }))]);
  }

  /** Runs `fn` after the queueing scheduled before it (errors are logged by the caller of deliver). */
  schedule(fn: () => Promise<unknown>) {
    this.pending = this.pending.then(fn).catch((e) => console.error(`[pdi] ${errorMessage(e)}`));
  }

  /** Sends what is due; a failure stays queued with a doubling delay (1 min … 1 h) and is dropped after MAX_ATTEMPTS. */
  deliver(): Promise<void> {
    this.delivering ??= this.deliverDue().finally(() => (this.delivering = undefined));
    return this.delivering;
  }

  private async deliverDue() {
    await this.pending;
    if (!this.enabled) return;
    const due = (await this.store.pdiOutbox()).filter((e) => new Date(e.nextAt) <= this.clock());
    for (const entry of due) {
      const error = await this.send(entry);
      const at = this.clock();
      await this.store.updatePdiOutbox((all) =>
        all.flatMap((e): PdiOutboxEntry[] => {
          if (e.event.id !== entry.event.id) return [e];
          if (!error) return [];
          const attempts = e.attempts + 1;
          if (attempts >= MAX_ATTEMPTS) return [];
          const wait = Math.min(60 * 2 ** (attempts - 1), MAX_BACKOFF_SECONDS);
          return [{ ...e, attempts, nextAt: new Date(at.getTime() + wait * 1000).toISOString(), lastError: error }];
        }),
      );
      if (error && entry.attempts + 1 >= MAX_ATTEMPTS)
        await this.store.audit({ at: at.toISOString(), kind: 'pdi', actor: 'system', summary: `Gave up sending ${entry.event.type} for ${String(entry.event.payload.change)} to pdi after ${MAX_ATTEMPTS} attempts: ${error}` });
    }
  }

  private async send(entry: PdiOutboxEntry): Promise<string | undefined> {
    const body = JSON.stringify(entry.event);
    const ts = String(Math.floor(this.clock().getTime() / 1000));
    try {
      const res = await this.fetch(`${this.eventsUrl}/events/ci_for_sdlc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pdi-timestamp': ts, 'x-pdi-event': entry.event.type, 'x-pdi-signature': pdiSignature(this.secret!, ts, body) },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.ok ? undefined : `pdi answered ${res.status}`;
    } catch (e) {
      return `pdi unreachable: ${errorMessage(e)}`.slice(0, 300);
    }
  }

  /** Remembers a handled gate.decided; false when it was handled before. */
  async firstTime(eventId: string): Promise<boolean> {
    let fresh = false;
    await this.store.updatePdiState((s) => {
      const seen = s.seen ?? [];
      fresh = !seen.includes(eventId);
      return { sent: s.sent ?? {}, seen: fresh ? [...seen, eventId].slice(-500) : seen };
    });
    return fresh;
  }

  /** For GET /api/pdi: configuration without the secret, readiness last sent, queued events. */
  async status() {
    const [state, outbox] = await Promise.all([this.store.pdiState(), this.store.pdiOutbox()]);
    return { enabled: this.enabled, receiving: !!this.secret, eventsUrl: this.eventsUrl ?? null, sent: state.sent ?? {}, outbox };
  }
}
