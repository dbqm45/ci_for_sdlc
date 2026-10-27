/**
 * What to do with an API answer when the server may ask for a token (CI_ADMIN_TOKEN for changes, CI_READ_TOKEN for
 * reads; K1b, docs/READ-TOKEN-K1B-PLAN.md). `used` is the token the request carried, `current` the one saved now:
 * several reads at start get a 401 together, and only the first one asks.
 */
export type AuthStep = 'ok' | 'fail' | 'prompt' | 'retry' | 'forget';

export function authStep(a: { status: number; challenge: boolean; retried: boolean; used: string; current: string }): AuthStep {
  if (a.status !== 401) return 'ok';
  if (!a.challenge) return 'fail';
  if (a.retried) return 'forget';
  if (a.current && a.current !== a.used) return 'retry';
  return 'prompt';
}
