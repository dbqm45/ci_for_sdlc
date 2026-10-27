import { createHmac, timingSafeEqual } from 'node:crypto';
import { decisionRecordedEvent, errorMessage, gateRequestedEvent, readinessEvents, type ChangeReadiness, type DecisionRecordedInput, type GateRequestInput } from '@ci/core';
import type { AutoCloseStep } from './auto-close.js';
import type { PdiOutboxEntry, Store } from './store.js';

/**
 * Link with pdi (F4, docs/PDI-F4-PLAN.md). Out: `readiness.changed` per change to `PDI_EVENTS_URL/events/ci_for_sdlc`
 * (pdi-receiver), and `decision.recorded` for every A2a step with a `finding.auto_close` decision (A2b: pdi answers
 * with its DEC number, kept on the local decision). In: `gate.decided` on `POST /api/webhooks/pdi`. Both ways the same signature, as pdi-receiver
 * checks it: `X-PDI-Signature: v1=<hex HMAC-SHA256(PDI_SIGNING_SECRET, "<X-PDI-Timestamp>.<raw body>")>`.
 */

export interface PdiOptions {
  /** Base URL of pdi-receiver; defaults to PDI_EVENTS_URL. */
  eventsUrl?: string;
  /** Shared with pdi (its PDI_CI_FOR_SDLC_SIGNING_SECRET); defaults to PDI_SIGNING_SECRET. */
  secret?: string;
  fetch?: typeof fetch;
  clock?: () => Date;
  /** CI_PUBLIC_URL, for links to findings in decision.recorded. */
  publicUrl?: string;
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
  private readonly publicUrl?: string;
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
    this.publicUrl = opts.publicUrl;
  }

  /** Sending needs both the receiver's address and the secret; receiving only the secret. */
  get enabled() {
    return !!(this.eventsUrl && this.secret);
  }

  now() {
    return this.clock();
  }

  /**
   * F5: the store of a workspace, for the DEC of its decisions; the link's own store (`default`) when unset or for a
   * workspace that is gone.
   */
  storeOf?: (workspace: string) => Store | undefined;
  private storeFor(workspace?: string) {
    return (workspace && this.storeOf?.(workspace)) || this.store;
  }

  /**
   * After an analysis: queue `readiness.changed` for every change whose readiness differs from the last one sent.
   * `changes` are those of all workspaces together (F5).
   */
  async enqueue(changes: ChangeReadiness[]) {
    if (!this.enabled) return;
    const now = this.clock().toISOString();
    let events: ReturnType<typeof readinessEvents>['events'] = [];
    await this.store.updatePdiState((s) => {
      const r = readinessEvents(changes, s.sent ?? {}, now);
      events = r.events;
      return { ...s, sent: r.sent, seen: s.seen ?? [] };
    });
    if (events.length) await this.store.updatePdiOutbox((all) => [...all, ...events.map((event) => ({ event, attempts: 0, nextAt: now }))]);
  }

  /** F4: a person asks pdi to decide "Approve for implementation" for a change that is not ready (`gate.requested`). */
  async requestApproval(input: Omit<GateRequestInput, 'publicUrl'>) {
    const now = this.clock().toISOString();
    const event = gateRequestedEvent({ ...input, publicUrl: this.publicUrl }, now);
    await this.store.updatePdiState((s) => ({ ...s, requested: { ...s.requested, [input.change.change]: { at: now, by: input.requestedBy, event: event.id } } }));
    await this.store.updatePdiOutbox((all) => [...all.filter((e) => e.event.id !== event.id), { event, attempts: 0, nextAt: now }]);
    return event;
  }

  /**
   * A2b: one `decision.recorded` per decided A2a step (accept, edit, reject, reopen, apply). A reopen waits in the queue
   * until the decision it reopens has its DEC; `changeOf` gives the item's CHG from its `change:` label.
   */
  async enqueueDecisions(steps: AutoCloseStep[], changeOf: (itemKey: string) => string | undefined, workspace?: string) {
    if (!this.enabled || !steps.length) return;
    const now = this.clock().toISOString();
    const entries = steps.map(({ event: e, question, actor, answer, why }): PdiOutboxEntry => {
      const outcome = e.outcome as DecisionRecordedInput['outcome'];
      const event = decisionRecordedEvent(
        {
          outcome,
          proposalId: e.proposalId,
          itemKey: e.itemKey ?? '',
          findingId: e.findingId ?? '',
          question,
          quote: e.quote ?? '',
          source: { title: e.source?.title ?? 'its source', url: e.source?.url },
          answer,
          decidedBy: actor,
          rule: e.rule,
          change: e.itemKey ? changeOf(e.itemKey) : undefined,
          why,
          publicUrl: this.publicUrl,
          workspace,
        },
        e.at,
      );
      const reopen = outcome === 'reopened';
      return {
        event,
        attempts: 0,
        nextAt: now,
        ...(!reopen && e.decisionId && { decisionId: e.decisionId }),
        ...(reopen && e.decisionId && { reopensDecisionId: e.decisionId }),
        logRef: { proposalId: e.proposalId, outcome: e.outcome, at: e.at },
        ...(workspace && { workspace }),
      };
    });
    await this.store.updatePdiOutbox((all) => [...all, ...entries]);
  }

  /** Runs `fn` after the queueing scheduled before it (errors are logged by the caller of deliver). */
  schedule(fn: () => Promise<unknown>) {
    this.pending = this.pending.then(fn).catch((e) => console.error(`[pdi] ${errorMessage(e)}`));
  }

  /**
   * Sends what is due; a failure stays queued with a doubling delay (1 min … 1 h). `readiness.changed` is dropped after
   * MAX_ATTEMPTS; a decision or a request for approval stays until pdi takes it, and one pdi refused (400) stays as
   * failed without retries.
   */
  deliver(): Promise<void> {
    this.delivering ??= this.deliverDue().finally(() => (this.delivering = undefined));
    return this.delivering;
  }

  private async deliverDue() {
    await this.pending;
    if (!this.enabled) return;
    const due = (await this.store.pdiOutbox()).filter((e) => !e.failed && new Date(e.nextAt) <= this.clock());
    for (const queued of due) {
      let entry = queued;
      if (entry.reopensDecisionId) {
        // A reopen supersedes the DEC of the decision it reopens; until pdi has given that one, it waits (no attempt).
        const dec = (await this.storeFor(entry.workspace).decisions()).find((d) => d.id === entry.reopensDecisionId)?.pdiDecision;
        if (!dec) continue;
        entry = { ...entry, event: { ...entry.event, payload: { ...entry.event.payload, supersedes: dec } } };
      }
      const r = await this.send(entry);
      const at = this.clock();
      const isDecision = entry.event.type === 'decision.recorded';
      // What a person did (a decision, a request for approval) stays until pdi takes it; a readiness update is replaced
      // by the next one anyway.
      const kept = isDecision || entry.event.type === 'gate.requested';
      const refused = kept && r.status === 400;
      await this.store.updatePdiOutbox((all) =>
        all.flatMap((e): PdiOutboxEntry[] => {
          if (e.event.id !== entry.event.id) return [e];
          if (!r.error) return [];
          if (refused) return [{ ...entry, failed: r.error, lastError: r.error }];
          const attempts = e.attempts + 1;
          if (attempts >= MAX_ATTEMPTS && !kept) return [];
          const wait = Math.min(60 * 2 ** (attempts - 1), MAX_BACKOFF_SECONDS);
          return [{ ...e, attempts, nextAt: new Date(at.getTime() + wait * 1000).toISOString(), lastError: r.error }];
        }),
      );
      const what = isDecision ? `decision.recorded for ${String(entry.event.payload.ref)}` : `${entry.event.type} for ${String(entry.event.payload.change)}`;
      if (!r.error && r.decision) await this.keepDecisionNumber(entry, r.decision);
      if (refused) await this.store.audit({ at: at.toISOString(), kind: 'pdi', actor: 'system', summary: `pdi refused ${what}: ${r.error}` });
      else if (r.error && !kept && entry.attempts + 1 >= MAX_ATTEMPTS)
        await this.store.audit({ at: at.toISOString(), kind: 'pdi', actor: 'system', summary: `Gave up sending ${what} to pdi after ${MAX_ATTEMPTS} attempts: ${r.error}` });
    }
  }

  /** pdi's DEC on the local decision (accept, edit, apply) and on the step in the proposal log. */
  private async keepDecisionNumber(entry: PdiOutboxEntry, dec: string) {
    const store = this.storeFor(entry.workspace);
    if (entry.decisionId) await store.updateDecisions((all) => all.map((d) => (d.id === entry.decisionId ? { ...d, pdiDecision: dec } : d)));
    const ref = entry.logRef;
    if (ref) await store.updateAutoCloseLog((all) => all.map((e) => (e.proposalId === ref.proposalId && e.outcome === ref.outcome && e.at === ref.at ? { ...e, pdiDecision: dec } : e)));
  }

  private async send(entry: PdiOutboxEntry): Promise<{ error?: string; status?: number; decision?: string }> {
    const body = JSON.stringify(entry.event);
    const ts = String(Math.floor(this.clock().getTime() / 1000));
    try {
      const res = await this.fetch(`${this.eventsUrl}/events/ci_for_sdlc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pdi-timestamp': ts, 'x-pdi-event': entry.event.type, 'x-pdi-signature': pdiSignature(this.secret!, ts, body) },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const answer: unknown = await res.json().catch(() => undefined);
      const field = (k: string) => (answer && typeof answer === 'object' && typeof (answer as Record<string, unknown>)[k] === 'string' ? ((answer as Record<string, unknown>)[k] as string) : undefined);
      if (res.ok) {
        const decision = field('decision');
        return { status: res.status, ...(decision && /^[A-Z][A-Z0-9]+-[0-9]+$/.test(decision) && { decision }) };
      }
      const why = field('error');
      return { status: res.status, error: `pdi answered ${res.status}${why ? `: ${why.slice(0, 500)}` : ''}` };
    } catch (e) {
      return { error: `pdi unreachable: ${errorMessage(e)}`.slice(0, 300) };
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
    return { enabled: this.enabled, receiving: !!this.secret, eventsUrl: this.eventsUrl ?? null, sent: state.sent ?? {}, requested: state.requested ?? {}, outbox };
  }
}
