/**
 * The local beta walkthrough's API (docs/BETA-LOCAL.md): only answered by a server with CI_BETA_LOCAL=1 on loopback.
 * Plain fetch with the browser's Origin; no token, no workspace prefix.
 */
export interface LocalPerson {
  name: string;
  email: string;
  note: string;
}
export interface LocalMail {
  id: number;
  at: string;
  to: string[];
  subject: string;
  text: string;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { detail?: string };
  if (!res.ok) throw new Error(json.detail ?? `HTTP ${res.status}`);
  return json;
}

export const localInfo = () => call<{ people: LocalPerson[]; offsetDays: number; now: string }>('GET', '/api/dev/beta');
export const localLogin = (who: { name: string; email: string; invite?: string }) => call<{ ok: true }>('POST', '/api/dev/login', who);
export const localMails = () => call<LocalMail[]>('GET', '/api/dev/mails');
export const moveClock = (days: number) => call<{ offsetDays: number; now: string }>('POST', '/api/dev/clock', { days });

/** The invitation token in a local login address (`#/dev/login?invite=…`), if any. */
export const inviteFromHash = (hash: string) => new URLSearchParams(hash.split('?')[1] ?? '').get('invite') ?? undefined;

/**
 * The page of the walkthrough an address names: `login`, `mail`, or none. Inside a workspace the app rewrites the
 * address to `#/w/<ws>/dev/…`, so the workspace prefix is allowed.
 */
export function localPage(hash: string): 'login' | 'mail' | undefined {
  const m = /^#?(?:\/w\/[^/]+)?\/dev\/(login|mail)(?:[?/]|$)/.exec(hash);
  return m ? (m[1] as 'login' | 'mail') : undefined;
}

/** "Now" for the beta's texts: the server's moved clock in the local walkthrough, else this browser's. */
export const betaNow = (local: { now: string } | undefined) => (local ? Date.parse(local.now) : Date.now());
