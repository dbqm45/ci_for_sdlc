import { afterEach, describe, expect, it } from 'vitest';
import { rlsRoleProblem, securityHeaders, trustProxyFrom } from '../src/production.js';
import { removeDir, startAccounts, tempDir, type App } from './accounts-helpers.js';

/** Running in front of people on the internet (T1, docs/DEPLOYMENT.md). */
describe('security headers', () => {
  it('PROD-01: a strict policy everywhere, HSTS only over https', () => {
    const local = securityHeaders('http://localhost:4317');
    expect(local['content-security-policy']).toContain("script-src 'self'");
    expect(local['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(local['content-security-policy']).not.toMatch(/script-src[^;]*unsafe/);
    expect(local).toMatchObject({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' });
    expect(local).not.toHaveProperty('strict-transport-security');
    expect(securityHeaders('https://quorum.example.com')['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  });
});

describe('the client behind the load balancer', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['1', 'fn'],
    ['3', 'fn'],
  ])('PROD-02: CI_TRUST_PROXY=%s', (value, expected) => {
    const r = trustProxyFrom(value);
    expect(typeof r === 'function' ? 'fn' : r).toBe(expected);
  });

  it.each(['true', '0', '6', 'all', '10.0.0.0/8'])('PROD-03: CI_TRUST_PROXY=%s is refused (only a number of hops)', (value) => {
    expect(() => trustProxyFrom(value)).toThrow(/number of proxies/);
  });

  it('PROD-04: one hop trusts the proxy itself and nothing a client wrote before it', () => {
    const trust = trustProxyFrom('1');
    if (!trust) throw new Error('expected a function');
    expect([trust('10.0.0.1', 0), trust('203.0.113.9', 1), trust('6.6.6.6', 2)]).toEqual([true, false, false]);
  });
});

describe('the database role', () => {
  it.each([
    [{ rolsuper: false, rolbypassrls: false }, undefined],
    [{ rolsuper: true, rolbypassrls: false }, /superuser/],
    [{ rolsuper: false, rolbypassrls: true }, /BYPASSRLS/],
    [undefined, /could not be read/],
  ])('PROD-05: %j', (role, expected) => {
    const p = rlsRoleProblem(role);
    if (expected) expect(p).toMatch(expected);
    else expect(p).toBeUndefined();
  });
});

describe('the server', () => {
  let dir: string;
  let app: App | undefined;
  const saved = process.env.CI_TRUST_PROXY;
  afterEach(async () => {
    await app?.app.close();
    app = undefined;
    removeDir(dir);
    if (saved === undefined) delete process.env.CI_TRUST_PROXY;
    else process.env.CI_TRUST_PROXY = saved;
  });

  it('PROD-06: every answer carries the security headers', async () => {
    dir = tempDir();
    app = await startAccounts(dir, {});
    for (const url of ['/api/health', '/api/auth/me', '/api/nope']) {
      const r = await app.app.inject({ method: 'GET', url });
      expect(r.headers['content-security-policy'], url).toContain("default-src 'self'");
      expect(r.headers['x-frame-options'], url).toBe('DENY');
    }
  });

  it("PROD-07: behind one proxy the beta form's limit counts the client's address, which a client cannot fake", async () => {
    dir = tempDir();
    process.env.CI_TRUST_PROXY = '1';
    app = await startAccounts(dir, {});
    const apply = (forwardedFor: string, i: number) =>
      app!.app.inject({
        method: 'POST',
        url: '/api/beta/apply',
        remoteAddress: '10.0.0.1',
        headers: { origin: 'http://localhost:4317', host: 'localhost:4317', 'x-forwarded-for': forwardedFor },
        payload: { org: 'Org', team: `T${i}`, contactName: 'A', contactEmail: `p${i}@x.example`, writers: 1, builders: 1, sources: ['jira'], realData: 'yes', consents: { terms: true, measurement: true, surveys: true } },
      });
    for (let i = 0; i < 5; i++) expect((await apply(`${i}.1.1.1, 198.51.100.7`, i)).statusCode).toBe(202);
    // The same client again, whatever it put in front: limited.
    expect((await apply('9.9.9.9, 198.51.100.7', 6)).statusCode).toBe(429);
    // Another client behind the same proxy is not.
    expect((await apply('198.51.100.8', 7)).statusCode).toBe(202);
  });
});
