import { createHmac, randomBytes } from 'node:crypto';
import type { Backend } from './backend.js';

/**
 * Usage measurement for the closed beta (T8, docs/BETA-PLAN.md §8; owner's decision 2026-11-09: our own log plus
 * PostHog when a key is set). The server sends events, the browser never does: no autocapture, no session replay,
 * no content from Jira, Confluence or Figma, no names or e-mails. Every event is checked against a closed list of
 * properties; a property outside it never leaves this module. People, workspaces and organizations go to PostHog
 * only as pseudonyms (HMAC with a secret of this installation).
 */
export const USAGE_EVENTS = {
  source_connected: { source: 'string' },
  analysis_completed: { trigger: 'string', items: 'number', findings_open: 'number', durationMs: 'number', ai: 'boolean', ai_calls: 'number', ai_cost_usd: 'number' },
  finding_shown: { rule: 'string', severity: 'string', origin: 'string' },
  finding_decided: { rule: 'string', severity: 'string', origin: 'string', effect: 'string', age_hours: 'number' },
  answer_proposal_judged: { outcome: 'string', rule: 'string' },
  item_approved: { forced: 'boolean', blocking_findings: 'number' },
  drift_detected: { kind: 'string' },
  item_viewed: { type: 'string' },
  survey_answered: { survey: 'string' },
} as const satisfies Record<string, Record<string, 'string' | 'number' | 'boolean'>>;
export type UsageEventName = keyof typeof USAGE_EVENTS;
type Props<E extends UsageEventName> = { [K in keyof (typeof USAGE_EVENTS)[E]]?: (typeof USAGE_EVENTS)[E][K] extends 'string' ? string : (typeof USAGE_EVENTS)[E][K] extends 'number' ? number : boolean };

/** One event as kept in our own log (`usage-events` in `_platform`): ids in clear, the person as a pseudonym. */
export interface UsageEvent {
  event: UsageEventName;
  at: string;
  orgId: string;
  workspace: string;
  /** The person as a pseudonym; none for what nobody asked for (schedule, webhooks). */
  user?: string;
  props: Record<string, string | number | boolean>;
}

/** Only the listed properties, of the listed type; strings at most 80 characters (rule ids, kinds, enums). */
export function cleanProps(event: UsageEventName, props: Record<string, unknown>): Record<string, string | number | boolean> {
  const allowed = USAGE_EVENTS[event] as Record<string, string>;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, type] of Object.entries(allowed)) {
    const v = props[k];
    if (type === 'number' && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 10_000) / 10_000;
    else if (type === 'boolean' && typeof v === 'boolean') out[k] = v;
    else if (type === 'string' && typeof v === 'string' && v) out[k] = v.slice(0, 80);
  }
  return out;
}

/** Where events go besides our own log. */
export interface UsageSink {
  send(events: UsageEvent[], pseudonym: (kind: string, id: string) => string): Promise<void>;
}

/** PostHog's batch API (EU region by default). Events are buffered and sent in batches; nothing personal goes out. */
export class PostHogSink implements UsageSink {
  constructor(
    private readonly apiKey: string,
    private readonly host = 'https://eu.i.posthog.com',
  ) {}
  async send(events: UsageEvent[], p: (kind: string, id: string) => string) {
    const batch = events.map((e) => ({
      event: e.event,
      // Anonymous events (schedule, webhooks) are the workspace's; personless events do not create person profiles.
      distinct_id: e.user ?? p('workspace', e.workspace),
      timestamp: e.at,
      properties: { ...e.props, workspace: p('workspace', e.workspace), $groups: { organization: p('org', e.orgId) }, $process_person_profile: !!e.user, $geoip_disable: true },
    }));
    const res = await fetch(`${this.host.replace(/\/$/, '')}/batch/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey, batch }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`PostHog refused ${batch.length} events: HTTP ${res.status}`);
  }
}

export interface UsageConfig {
  /** CI_USAGE=off stops all measurement. */
  enabled: boolean;
  sink?: UsageSink;
  /** For pseudonyms; when unset a random one is created once and kept in `_platform`. */
  secret?: string;
  log?: (o: object, msg: string) => void;
}

export class Usage {
  private secret = '';
  private buffer: UsageEvent[] = [];
  private flushing: Promise<void> = Promise.resolve();
  /** Work started after a response or an analysis, so closing the server waits for it. */
  private readonly running = new Set<Promise<unknown>>();

  constructor(
    private readonly backend: Backend,
    readonly cfg: UsageConfig,
  ) {}

  async init() {
    await this.backend.init();
    if (this.cfg.secret) this.secret = this.cfg.secret;
    else {
      const stored = (await this.backend.read('usage-secret.json')) as { secret?: string } | undefined;
      this.secret = stored?.secret ?? randomBytes(32).toString('base64url');
      if (!stored?.secret) await this.backend.write('usage-secret.json', { secret: this.secret });
    }
  }

  /** A stable pseudonym: the same id gives the same value, and the value does not give the id back. */
  pseudonym = (kind: string, id: string) => createHmac('sha256', this.secret).update(`${kind}:${id}`).digest('hex').slice(0, 20);

  /** Records an event in our log and queues it for the sink. Never throws: measurement must not break the product. */
  async track<E extends UsageEventName>(event: E, ctx: { orgId: string; workspace: string; userId?: string; at?: string }, props: Props<E>) {
    if (!this.cfg.enabled) return;
    const e: UsageEvent = { event, at: ctx.at ?? new Date().toISOString(), orgId: ctx.orgId, workspace: ctx.workspace, ...(ctx.userId && { user: this.pseudonym('user', ctx.userId) }), props: cleanProps(event, props) };
    try {
      await this.backend.append('usage-events', e);
    } catch (err) {
      this.cfg.log?.({ err: String(err), event }, 'usage event not stored');
      return;
    }
    if (this.cfg.sink) {
      this.buffer.push(e);
      if (this.buffer.length >= 50) void this.flush();
    }
  }

  /** Keeps `work` until it settles, so `idle()` (on close) waits for it; errors are the caller's. */
  watch<T>(work: Promise<T>): Promise<T> {
    this.running.add(work);
    void work.then(
      () => this.running.delete(work),
      () => this.running.delete(work),
    );
    return work;
  }

  /** Resolves when every watched piece of work has settled, then sends what is buffered. */
  async idle() {
    while (this.running.size) await Promise.allSettled([...this.running]);
    await this.flush();
  }

  /** Sends what is buffered; a failed batch is kept for the next try (at most 5000 events). */
  flush(): Promise<void> {
    this.flushing = this.flushing.then(async () => {
      if (!this.cfg.sink || !this.buffer.length) return;
      const batch = this.buffer.splice(0, 500);
      try {
        await this.cfg.sink.send(batch, this.pseudonym);
      } catch (err) {
        this.buffer.unshift(...batch);
        this.buffer.splice(5000);
        this.cfg.log?.({ err: String(err) }, 'usage events not sent; kept for the next try');
      }
    });
    return this.flushing;
  }

  /** Every event of one organization, oldest first. */
  async eventsOf(orgId: string): Promise<UsageEvent[]> {
    return ((await this.backend.tail('usage-events', 200_000)) as UsageEvent[]).filter((e) => e?.orgId === orgId);
  }
}

const WEEK_MS = 7 * 24 * 3_600_000;
const HOUR_MS = 3_600_000;

export interface UsageWeek {
  week: number;
  from: string;
  analyses: number;
  decisions: number;
  /** At least one analysis and one decision (BETA-PLAN.md §8, "aktywny tydzień zespołu"). */
  active: boolean;
  aiCostUsd: number;
}

export interface UsageReport {
  weeks: UsageWeek[];
  activeWeeks: number;
  decided: number;
  /** resolve + accept_risk of all decided findings; null without decisions. */
  accuracy: number | null;
  /** dismiss of all decided findings, per origin of the finding. */
  falseAlarms: Record<string, number | null>;
  /** Findings shown more than 14 days ago without a decision since, of all shown that long ago. */
  unreacted: number | null;
  /** The same as counts: how many have no reaction, of how many shown more than 14 days ago. */
  unreactedCount: number;
  shownOver14Days: number;
  /** From the first source connection (else the first analysis) to the first decision. */
  hoursToFirstDecision: number | null;
  /** Answer proposals accepted without change, of all judged. */
  answerAcceptance: number | null;
  /** Forced approvals of all approvals. */
  forcedApprovals: number | null;
  aiCostUsd: number;
  surveysAnswered: number;
}

const ratio = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 1000 : null);

/** The measures of BETA-PLAN.md §8 from one team's events, week by week from the start of its beta. */
export function usageReport(events: UsageEvent[], startedAt: string, now: number): UsageReport {
  const start = Date.parse(startedAt);
  const count = Math.max(1, Math.ceil((now - start) / WEEK_MS));
  const weeks: UsageWeek[] = Array.from({ length: count }, (_, i) => ({ week: i + 1, from: new Date(start + i * WEEK_MS).toISOString(), analyses: 0, decisions: 0, active: false, aiCostUsd: 0 }));
  const of = (name: UsageEventName) => events.filter((e) => e.event === name);
  for (const e of events) {
    const w = weeks[Math.floor((Date.parse(e.at) - start) / WEEK_MS)];
    if (!w) continue;
    if (e.event === 'analysis_completed') {
      w.analyses++;
      w.aiCostUsd += typeof e.props.ai_cost_usd === 'number' ? e.props.ai_cost_usd : 0;
    }
    if (e.event === 'finding_decided') w.decisions++;
  }
  for (const w of weeks) {
    w.active = w.analyses > 0 && w.decisions > 0;
    w.aiCostUsd = Math.round(w.aiCostUsd * 10_000) / 10_000;
  }
  const decided = of('finding_decided');
  const byEffect = (fx: string[], list = decided) => list.filter((e) => fx.includes(String(e.props.effect))).length;
  const origins = [...new Set(decided.map((e) => String(e.props.origin ?? 'unknown')))];
  const shownOld = of('finding_shown').filter((e) => now - Date.parse(e.at) > 14 * 24 * HOUR_MS);
  // A shown finding counts as reacted to when the same rule got a decision later in the same workspace.
  const reacted = shownOld.filter((s) => decided.some((d) => d.workspace === s.workspace && d.props.rule === s.props.rule && Date.parse(d.at) >= Date.parse(s.at))).length;
  const firstSource = of('source_connected')[0] ?? of('analysis_completed')[0];
  const firstDecision = decided[0];
  const judged = of('answer_proposal_judged');
  const approvals = of('item_approved');
  return {
    weeks,
    activeWeeks: weeks.filter((w) => w.active).length,
    decided: decided.length,
    accuracy: ratio(byEffect(['resolve', 'accept_risk']), decided.length),
    falseAlarms: Object.fromEntries(origins.map((o) => [o, ratio(byEffect(['dismiss'], decided.filter((e) => String(e.props.origin ?? 'unknown') === o)), decided.filter((e) => String(e.props.origin ?? 'unknown') === o).length)])),
    unreacted: ratio(shownOld.length - reacted, shownOld.length),
    unreactedCount: shownOld.length - reacted,
    shownOver14Days: shownOld.length,
    hoursToFirstDecision: firstSource && firstDecision ? Math.round(((Date.parse(firstDecision.at) - Date.parse(firstSource.at)) / HOUR_MS) * 10) / 10 : null,
    answerAcceptance: ratio(judged.filter((e) => e.props.outcome === 'accept').length, judged.length),
    forcedApprovals: ratio(approvals.filter((e) => e.props.forced === true).length, approvals.length),
    aiCostUsd: Math.round(weeks.reduce((s, w) => s + w.aiCostUsd, 0) * 10_000) / 10_000,
    surveysAnswered: of('survey_answered').length,
  };
}

/** What started an analysis, from the engine's reason (`manual`, `scheduled (15 min)`, `jira change`, …). */
export function triggerOf(reason: string | undefined): string {
  const r = (reason ?? '').toLowerCase();
  if (r === 'manual') return 'manual';
  if (r.startsWith('scheduled')) return 'schedule';
  if (/^(jira|confluence|figma|repo|tests?) change$/.test(r)) return 'webhook';
  if (r.includes('pdi')) return 'pdi';
  if (r === 'initial') return 'initial';
  return 'change';
}
