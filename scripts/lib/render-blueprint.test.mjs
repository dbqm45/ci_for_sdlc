import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parse } from 'yaml';

// The Render Blueprint (render.yaml, docs/DEPLOYMENT.md): the promises the deployment makes about where data lives
// and how secrets are handled, checked so an edit cannot quietly break them.
const blueprint = parse(readFileSync(new URL('../../render.yaml', import.meta.url), 'utf8'));
const [web, backup] = blueprint.services;
const [db] = blueprint.databases;
const env = Object.fromEntries(web.envVars.map((e) => [e.key, e]));
const backupEnv = Object.fromEntries(backup.envVars.map((e) => [e.key, e]));

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
  });

  it('RB-05: current paid plans (Render\'s plan IDs, not legacy names or free) and a small database disk', () => {
    // Current IDs look like 0.5c-512mb / 1c-2g; legacy names (starter, standard) and free are refused.
    const plan = /^\d+(\.\d+)?c-\d+(mb|g)$/;
    assert.match(web.plan, plan);
    assert.match(db.plan, plan);
    assert.equal(db.diskSizeGB, 5);
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
    for (const e of [...web.envVars, ...backup.envVars].filter((x) => secret.test(x.key))) {
      assert.ok(e.sync === false || e.generateValue === true || e.fromDatabase, `${e.key} must not have a value in render.yaml`);
      assert.equal(e.value, undefined, `${e.key} has a value`);
    }
  });

  it("RB-07: the platform's AI is Claude on Bedrock in the EU, with a monthly limit per workspace (T4)", () => {
    assert.equal(env.CI_AI_PROVIDER.value, 'bedrock');
    assert.match(env.CI_AI_REGION.value, /^eu-/);
    assert.equal(env.CI_AI_MODEL.sync, false);
    assert.ok(Number(env.CI_AI_MONTHLY_LIMIT_USD.value) > 0);
    for (const k of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) assert.equal(env[k].sync, false, k);
  });

  it('RB-06: the daily backup (T5) runs in the EU from the same image, on the same database, after the checks pass', () => {
    assert.equal(backup.type, 'cron');
    assert.equal(backup.name, 'quorum-backup');
    assert.equal(backup.region, 'frankfurt');
    assert.match(backup.plan, /^\d+(\.\d+)?c-\d+(mb|g)$/);
    assert.match(backup.schedule, /^\d+ \d+ \* \* \*$/);
    assert.equal(backup.dockerfilePath, web.dockerfilePath);
    assert.equal(backup.dockerCommand, 'node --import tsx packages/server/src/backup-cli.ts');
    assert.equal(backup.autoDeployTrigger, 'checksPass');
    assert.equal(backupEnv.CI_DATABASE_URL.fromDatabase.name, db.name);
    for (const k of ['BACKUP_ENCRYPTION_KEY', 'B2_ENDPOINT', 'B2_BUCKET', 'B2_KEY_ID', 'B2_APPLICATION_KEY']) assert.equal(backupEnv[k]?.sync, false, k);
  });
});
