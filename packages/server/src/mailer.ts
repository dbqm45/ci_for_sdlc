/**
 * Transactional mail for the closed beta (docs/BETA-ENROLLMENT-PLAN.md, "Maile"): Resend (owner's decision
 * 2026-11-09) with RESEND_API_KEY and CI_MAIL_FROM; without the key, mails are only logged (who and the subject, never
 * the body, which can hold an invitation link). Mails carry links to the app, never the content of stories.
 */
export interface Mail {
  to: string[];
  subject: string;
  text: string;
  /** Sent as Resend's Idempotency-Key, so a retried send is not delivered twice. */
  key?: string;
}

export interface Mailer {
  readonly kind: 'resend' | 'log' | 'test';
  send(mail: Mail): Promise<void>;
}

export const RESEND_URL = 'https://api.resend.com/emails';

export class ResendMailer implements Mailer {
  readonly kind = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(m: Mail) {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', ...(m.key && { 'idempotency-key': m.key.slice(0, 256) }) },
      body: JSON.stringify({ from: this.from, to: m.to, subject: m.subject, text: m.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend refused the mail "${m.subject}": HTTP ${res.status}`);
  }
}

export class LogMailer implements Mailer {
  readonly kind = 'log';
  constructor(private readonly log: (o: object, msg: string) => void) {}
  async send(m: Mail) {
    this.log({ to: m.to, subject: m.subject }, 'mail not sent: RESEND_API_KEY is not set');
  }
}

/** Resend when RESEND_API_KEY and CI_MAIL_FROM are set; otherwise mails go to the log. */
export function mailerFromEnv(log: (o: object, msg: string) => void, env = process.env): Mailer {
  return env.RESEND_API_KEY && env.CI_MAIL_FROM ? new ResendMailer(env.RESEND_API_KEY, env.CI_MAIL_FROM) : new LogMailer(log);
}
