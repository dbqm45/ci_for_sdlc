import { AI_EFFORTS, AI_FINDINGS_ACTIONS, AI_PROVIDERS, AI_RUN_ON, DECISION_EFFECTS, DRIFT_REACTIONS, ISSUE_TYPES, SCHEDULE_MODES, SETTINGS_MODES, SEVERITY_ACTIONS } from '@ci/core';
import { describe, expect, it } from 'vitest';
import { decisionBody, pruneToSchema, settingsBody } from '../src/schemas.js';
import { DEFAULT_SETTINGS } from '../src/store.js';

const p = settingsBody.properties;

describe('settings contract', () => {
  it('the defaults pass the settings schema unchanged', () => {
    expect(pruneToSchema(DEFAULT_SETTINGS, settingsBody)).toEqual(DEFAULT_SETTINGS);
  });

  it('takes every enum from the core lists', () => {
    expect(p.mode.enum).toEqual(SETTINGS_MODES);
    expect(p.ai.properties.provider.enum).toEqual(AI_PROVIDERS);
    expect(p.ai.properties.effort.enum).toEqual(AI_EFFORTS);
    expect(p.ai.properties.runOn.enum).toEqual(AI_RUN_ON);
    expect(p.schedule.properties.mode.enum).toEqual(SCHEDULE_MODES);
    expect(p.policy.properties.actions.properties.critical.enum).toEqual(SEVERITY_ACTIONS);
    expect(p.policy.properties.aiFindings.enum).toEqual(AI_FINDINGS_ACTIONS);
    expect(p.policy.properties.driftReaction.enum).toEqual(DRIFT_REACTIONS);
    expect(p.integrations.properties.jira.properties.issueTypeMap.additionalProperties.enum).toEqual(ISSUE_TYPES);
    expect(decisionBody.properties.effect.enum).toEqual(DECISION_EFFECTS);
  });

  it('limits decision text to what the server stores', () => {
    const d = decisionBody.properties;
    expect([d.answer.maxLength, d.note.maxLength, d.reason.maxLength, d.changeReason.maxLength]).toEqual([500, 2000, 2000, 2000]);
  });
});
