import { STATUS_CODES } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FigmaRateLimitError } from '@ci/core';

/** How the caller proved it may change state. Recorded with every audit entry it causes. */
export type Principal = 'admin_token' | 'loopback' | 'pdi_signature';

export interface GuardConfig {
  /** CI_ADMIN_TOKEN. Empty = local mode: only loopback clients may change state. */
  adminToken: string;
  /** CI_ALLOWED_HOSTS: extra Host header values (with or without port). */
  allowedHosts: string[];
  /** CI_ALLOWED_ORIGINS: extra browser origins allowed to change state. */
  allowedOrigins: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export const guardConfigFromEnv = (env = process.env): GuardConfig => ({
  adminToken: env.CI_ADMIN_TOKEN ?? '',
  allowedHosts: list(env.CI_ALLOWED_HOSTS),
  allowedOrigins: list(env.CI_ALLOWED_ORIGINS),
});

/** An error the problem handler renders with its status, detail and headers. */
export const httpError = (statusCode: number, detail: string, headers?: Record<string, string>) => Object.assign(new Error(detail), { statusCode, headers });

const hostnameOf = (host: string) => (host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : (host.split(':')[0] ?? host)).toLowerCase();
const isLoopbackName = (name: string) => name === 'localhost' || name.endsWith('.localhost') || name === '[::1]' || /^127(\.\d{1,3}){3}$/.test(name);
const isLoopbackIp = (ip: string) => ip === '::1' || /^(::ffff:)?127(\.\d{1,3}){3}$/.test(ip);
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const sameSecret = (given: string, expected: string) => given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/**
 * Host check against DNS rebinding, Origin check against CSRF and the admin
 * token for every state-changing API call. Webhooks have their own secret.
 */
export function registerGuards(app: FastifyInstance, cfg: GuardConfig) {
  const hosts = new Set(cfg.allowedHosts.map((h) => h.toLowerCase()));
  const origins = new Set(cfg.allowedOrigins.map((o) => o.toLowerCase().replace(/\/$/, '')));
  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/webhooks/')) return;
    const host = (req.headers.host ?? '').toLowerCase();
    const hostOk = hosts.has(host) || hosts.has(hostnameOf(host)) || isLoopbackName(hostnameOf(host)) || (!hosts.size && !!cfg.adminToken);
    if (!hostOk) throw httpError(403, `Host "${host}" is not allowed. Add it to CI_ALLOWED_HOSTS.`);
    if (!MUTATING.has(req.method)) return;

    const origin = req.headers.origin?.toLowerCase();
    if (origin && origin !== 'null') {
      let o: URL | undefined;
      try {
        o = new URL(origin);
      } catch {
        /* rejected below */
      }
      const originOk = !!o && (origins.has(origin) || o.host === host || (isLoopbackName(o.hostname) && isLoopbackName(hostnameOf(host))));
      if (!originOk) throw httpError(403, `Origin "${origin}" may not change data here. Add it to CI_ALLOWED_ORIGINS.`);
    }

    if (cfg.adminToken) {
      const auth = req.headers.authorization ?? '';
      const given = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      if (!given || !sameSecret(given, cfg.adminToken)) throw httpError(401, 'This change requires the admin token (Authorization: Bearer …).', { 'www-authenticate': 'Bearer realm="ci"' });
      req.principal = 'admin_token';
    } else if (isLoopbackIp(req.ip)) {
      req.principal = 'loopback';
    } else {
      throw httpError(401, 'Changes from other machines are disabled. Set CI_ADMIN_TOKEN on the server and use it as a bearer token.');
    }
  });
}

/** The person acting. A display name sent by the client (X-CI-Actor, URL-encoded), not an identity: the principal is what authorizes. */
export function actorOf(req: FastifyRequest, body?: { by?: string; decidedBy?: string } | null) {
  let header = '';
  const raw = req.headers['x-ci-actor'];
  if (typeof raw === 'string') {
    try {
      header = decodeURIComponent(raw);
    } catch {
      header = raw;
    }
  }
  return (header.trim() || body?.by?.trim() || body?.decidedBy?.trim() || 'anonymous').slice(0, 80);
}

const GENERIC_5XX = 'An unexpected error occurred. Details are in the server log.';

const send = (reply: FastifyReply, req: FastifyRequest, status: number, detail: string, extra: Record<string, unknown> = {}) =>
  reply
    .status(status)
    .type('application/problem+json')
    .send({ type: 'about:blank', title: STATUS_CODES[status] ?? 'Error', status, detail, instance: req.url.split('?')[0], ...extra });

/** Every API error as RFC 9457 problem+json; 5xx never reveal internals. */
export function registerProblemHandler(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError & { headers?: Record<string, string> }, req, reply) => {
    if (err.validation) {
      const errors = err.validation.map((v) => {
        const p = v.params as { missingProperty?: string; additionalProperty?: string };
        const extra = p.missingProperty ?? p.additionalProperty;
        return { field: `${v.instancePath}${extra ? `/${extra}` : ''}` || '/', message: v.message ?? 'invalid' };
      });
      return send(reply, req, 422, `Invalid ${err.validationContext ?? 'request'}: ${errors.map((e) => `${e.field} ${e.message}`).join('; ')}`, { errors });
    }
    if (err instanceof FigmaRateLimitError) {
      const { retryAfterMs, rateLimitType, planTier, endpoint } = err as FigmaRateLimitError;
      req.log.warn({ retryAfterMs, rateLimitType, planTier, endpoint }, err.message);
      if (retryAfterMs !== undefined) reply.header('retry-after', String(Math.ceil(retryAfterMs / 1000)));
      return send(reply, req, 429, 'Figma API rate limit exceeded. Please retry later.');
    }
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    if (err.headers) reply.headers(err.headers);
    return send(reply, req, status, status >= 500 ? GENERIC_5XX : err.message);
  });
}

export const notFound = (req: FastifyRequest, reply: FastifyReply) => send(reply, req, 404, `No API route ${req.method} ${req.url.split('?')[0]}`);
