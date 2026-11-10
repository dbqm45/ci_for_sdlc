import type { Pool } from 'pg';

/**
 * What the server needs to run safely in front of people on the internet (T1, docs/DEPLOYMENT.md): security headers
 * on every response, the client's address behind the hosting's load balancer, and a database role that row-level
 * security applies to.
 */

/**
 * Headers on every response. The UI loads only its own scripts and styles (Vite build) and `data:` images, so the
 * policy allows nothing else; inline `style` attributes (React) need `style-src 'unsafe-inline'`. HSTS only over
 * https, so local http keeps working.
 */
export function securityHeaders(publicUrl: string): Record<string, string> {
  return {
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    ...(publicUrl.startsWith('https://') && { 'strict-transport-security': 'max-age=31536000; includeSubDomains' }),
  };
}

/**
 * CI_TRUST_PROXY: how many proxies (the hosting's load balancer) stand in front of the server, so `req.ip` is the
 * client's address and not the proxy's (the beta form's per-address limit relies on it). A number of hops only: with
 * "trust all" a client could pick its own address through X-Forwarded-For. Unset = no proxy (direct or local).
 */
export function trustProxyFrom(value: string | undefined): false | ((address: string, hop: number) => boolean) {
  const v = (value ?? '').trim();
  if (!v) return false;
  if (!/^[1-5]$/.test(v)) throw new Error(`CI_TRUST_PROXY must be the number of proxies in front of the server (1–5), not "${v}".`);
  const hops = Number(v);
  // The nearest `hops` addresses are the proxies; the one behind them is the client.
  return (_address, hop) => hop < hops;
}

/**
 * Why the database role defeats row-level security, if it does: a superuser or a role with BYPASSRLS reads every
 * workspace's rows whatever the policies say (docs/WORKSPACES-F5-PLAN.md, "Postgres").
 */
export function rlsRoleProblem(role: { rolsuper: boolean; rolbypassrls: boolean } | undefined): string | undefined {
  if (!role) return 'the database role could not be read';
  if (role.rolsuper) return 'the database role is a superuser, so row-level security does not apply';
  if (role.rolbypassrls) return 'the database role has BYPASSRLS, so row-level security does not apply';
  return undefined;
}

/** Reads the connected role's attributes and judges them. */
export async function checkRlsRole(pool: Pool): Promise<string | undefined> {
  const r = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>('select rolsuper, rolbypassrls from pg_roles where rolname = current_user');
  return rlsRoleProblem(r.rows[0]);
}
