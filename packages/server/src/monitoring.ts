import type { Mailer } from './mailer.js';

/**
 * Monitoring (T6, docs/DEPLOYMENT.md "Monitoring"): the operator hears about a problem before a team does.
 *
 * - **Alerts by e-mail** (`Alerts`): server errors (5xx), failed background jobs, the database down, a workspace
 *   reaching its AI limit. Sent with the same mailer as the beta (Resend) to `CI_ALERT_EMAILS` (default
 *   `CI_OPERATOR_EMAILS`), at most one per kind and subject per hour; the next one says how many were held back.
 *   An alert names the route, job or workspace and a request id, never a request's content or a secret.
 * - **Heartbeats** (`heartbeat`): after each successful hourly run and each backup the server calls a URL of a
 *   dead-man's-switch service (`CI_HEARTBEAT_URL`, `BACKUP_HEARTBEAT_URL`); when the calls stop, that service alerts.
 * - **Uptime:** an external monitor polls `GET /api/health`, which answers 503 when the database does not respond.
 */

export type AlertKind = 'server_error' | 'job_failed' | 'database_down' | 'ai_limit_reached';

const TITLES: Record<AlertKind, string> = {
  server_error: 'Server error',
  job_failed: 'Background job failed',
  database_down: 'Database not responding',
  ai_limit_reached: 'A workspace reached its monthly AI limit',
};

export interface AlertsConfig {
  to: string[];
  publicUrl: string;
  /** One alert per kind and subject within this window (default one hour). */
  windowMs?: number;
  now?: () => number;
  log?: (o: Record<string, unknown>, msg: string) => void;
}

export class Alerts {
  private readonly sent = new Map<string, number>();
  private readonly held = new Map<string, number>();

  constructor(
    private readonly mailer: Mailer,
    readonly cfg: AlertsConfig,
  ) {}

  get enabled() {
    return this.cfg.to.length > 0;
  }

  /**
   * Sends one alert, unless one of the same kind and subject went out within the window (then it is counted and
   * mentioned in the next). Never throws: monitoring must not break what it watches. Returns whether a mail went.
   */
  async notify(kind: AlertKind, subject: string, details: Record<string, string | number | undefined> = {}): Promise<boolean> {
    if (!this.enabled) return false;
    const key = `${kind}:${subject}`;
    const now = (this.cfg.now ?? Date.now)();
    const last = this.sent.get(key);
    if (last !== undefined && now - last < (this.cfg.windowMs ?? 3_600_000)) {
      this.held.set(key, (this.held.get(key) ?? 0) + 1);
      return false;
    }
    this.sent.set(key, now);
    const heldBack = this.held.get(key) ?? 0;
    this.held.delete(key);
    const lines = [
      `${TITLES[kind]}: ${subject}`,
      '',
      ...Object.entries(details)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${String(v).slice(0, 300)}`),
      `time: ${new Date(now).toISOString()}`,
      ...(heldBack ? [`and ${heldBack} more of these in the last hour, not sent separately`] : []),
      '',
      `Logs: the Render dashboard → quorum → Logs (search for the request id). Server: ${this.cfg.publicUrl}`,
    ];
    try {
      await this.mailer.send({ to: this.cfg.to, subject: `[Quorum] ${TITLES[kind]}: ${subject}`.slice(0, 150), text: lines.join('\n') });
      return true;
    } catch (err) {
      this.cfg.log?.({ err: String(err), kind }, 'alert not sent');
      return false;
    }
  }
}

/** Calls a heartbeat URL (a dead-man's switch); a failure is logged, never thrown. Only https (http for localhost). */
export async function heartbeat(url: string | undefined, log?: (o: Record<string, unknown>, msg: string) => void, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error('a heartbeat URL must be https');
    const res = await fetchImpl(u, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    log?.({ err: String(err) }, 'heartbeat failed');
    return false;
  }
}

/** Whether the database answers within `timeoutMs`. */
export async function databaseResponds(query: () => Promise<unknown>, timeoutMs = 2000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      query().then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
