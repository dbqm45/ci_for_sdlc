import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

// The Render Blueprint (render.yaml, docs/DEPLOYMENT.md): the promises the deployment makes about where data lives
// and how secrets are handled, checked so an edit cannot quietly break them.
const blueprint = parse(readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8'));
const [web] = blueprint.services;
const [db] = blueprint.databases;
const env = Object.fromEntries(web.envVars.map((e) => [e.key, e]));

describe('render.yaml', () => {
  it('RB-01: the service and its database are in the EU, the database without an address on the internet', () => {
    assert.equal(web.region, 'frankfurt');
    assert.equal(db.region, 'frankfurt');
    assert.deepEqual(db.ipAllowList, []);
    assert.equal(env.CI_DATABASE_URL.fromDatabase.name, db.name);
  });

  it('RB-02: one instance from the Dockerfile, checked on /api/health, deployed only after the checks pass', () => {
    assert.equal(web.runtime, 'docker');
    assert.equal(web.numInstances, 1);
    assert.equal(web.healthCheckPath, '/api/health');
    assert.equal(web.autoDeployTrigger, 'checksPass');
    assert.notEqual(web.plan, 'free');
    assert.notEqual(db.plan, 'free');
  });

  it('RB-03: production, accounts and OAuth; never the local walkthrough', () => {
    assert.equal(env.NODE_ENV.value, 'production');
    assert.equal(env.CI_AUTH_MODE.value, 'accounts');
    assert.equal(env.CI_CONNECT_MODE.value, 'oauth');
    assert.equal(env.CI_TRUST_PROXY.value, '1');
    assert.equal(env.CI_BETA_LOCAL, undefined);
  });

  it('RB-04: no secret has a value in the file: Render asks for it or generates it', () => {
    const secret = /KEY|SECRET|TOKEN|PASSWORD/;
    for (const e of web.envVars.filter((x) => secret.test(x.key))) {
      assert.ok(e.sync === false || e.generateValue === true || e.fromDatabase, `${e.key} must not have a value in render.yaml`);
      assert.equal(e.value, undefined, `${e.key} has a value`);
    }
  });
});
