import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { CHANGE_LABEL_PREFIX, approvalQuestions, mergeChangeReadiness, workspacePath, changeKeyOf, changeReadiness, decisionRecordedEvent, gateRequestedEvent, humanDecisionEvent, pdiOrigin, parseGateDecided, readinessEvents, targetsStatusOf, type Decision, type DecisionRecordedInput, type ItemAnalysis, type RequirementItem } from '../src/index.js';

// F4 (pdi docs/plan-jeden-flow-sdlc.md §6): readiness of a pdi change (CHG-n) from the stories labelled `change:CHG-n`,
// sent to pdi as readiness.changed; gate.decided from pdi approves the stories. Envelopes: pdi contract 0.4.0.

const EVENTS = new URL('./fixtures/pdi-contract/0.4.0/events/', import.meta.url);
const example = (name: string) => JSON.parse(readFileSync(new URL(name, EVENTS), 'utf8'));

function req(key: string, labels: string[], type: RequirementItem['type'] = 'story'): RequirementItem {
  return { key, type, title: key, description: '', acceptanceCriteria: [], businessRules: [], status: 'To Do', labels, components: [], links: [], remoteLinks: [], updatedAt: '2026-10-26T00:00:00Z' };
}
function item(key: string, readiness: ItemAnalysis['readiness'], p: { drift?: boolean; openChallenges?: number; type?: ItemAnalysis['type'] } = {}): ItemAnalysis {
  const findings = p.drift ? [{ id: 'f1', origin: 'drift', status: 'open' }] : [];
  const challenges = Array.from({ length: p.openChallenges ?? 0 }, (_, i) => ({ id: `c${i}`, answered: false }));
  return { key, type: p.type ?? 'story', readiness, findings, challenges: [...challenges, { id: 'done', answered: true }] } as unknown as ItemAnalysis;
}

describe('changeKeyOf', () => {
  it('reads the change key from a label with the prefix', () => {
    expect(CHANGE_LABEL_PREFIX).toBe('change:');
    expect(changeKeyOf(['release:R1', 'change:CHG-12'])).toBe('CHG-12');
    expect(changeKeyOf(['chg/CHG-7'], 'chg/')).toBe('CHG-7');
  });

  it('ignores labels that are not a key and takes the first valid one', () => {
    expect(changeKeyOf(['change:later', 'change:chg-1'])).toBeUndefined();
    expect(changeKeyOf(['change:CHG-3', 'change:CHG-4'])).toBe('CHG-3');
    expect(changeKeyOf([])).toBeUndefined();
  });
});

describe('changeReadiness', () => {
  const reqs = [req('PAY-1', ['change:CHG-12']), req('PAY-2', ['change:CHG-12']), req('PAY-3', ['change:CHG-13']), req('PAY-9', []), req('PAY-100', ['change:CHG-12'], 'epic')];

  it('PRB-17: is not ready only when a story has a blocking finding; warnings alone do not hold the change back', () => {
    const out = changeReadiness([item('PAY-1', 'ready'), item('PAY-2', 'not_ready'), item('PAY-3', 'needs_attention', { openChallenges: 1 })], reqs);
    expect(out).toEqual([
      { change: 'CHG-12', readiness: 'not_ready', openQuestions: 0, items: ['PAY-1', 'PAY-2'] },
      { change: 'CHG-13', readiness: 'ready', openQuestions: 1, items: ['PAY-3'] },
    ]);
  });

  it('reports drift when a story has an open drift finding, and counts open questions', () => {
    const out = changeReadiness([item('PAY-1', 'ready', { openChallenges: 2 }), item('PAY-2', 'not_ready', { drift: true, openChallenges: 1 })], reqs);
    expect(out[0]).toEqual({ change: 'CHG-12', readiness: 'drift', openQuestions: 3, items: ['PAY-1', 'PAY-2'] });
  });

  it('leaves out epics, unlabelled items and items the analysis does not know', () => {
    const out = changeReadiness([item('PAY-1', 'ready'), item('PAY-9', 'ready'), item('PAY-100', 'not_ready', { type: 'epic' })], reqs);
    expect(out.map((c) => [c.change, c.items])).toEqual([['CHG-12', ['PAY-1']]]);
  });

  it('holds a change back on a blocking security finding of the change itself (Z8c), though epics are otherwise left out', () => {
    const sec = (status: string, blocks: boolean) => ({ ...item('PAY-100', 'ready', { type: 'epic' }), findings: [{ id: 's1', ruleId: 'SEC-001', origin: 'rule', status, blocks }] }) as unknown as ItemAnalysis;
    const all = [...reqs, req('PAY-100', ['change:CHG-12'], 'epic')];
    expect(changeReadiness([item('PAY-1', 'ready'), sec('open', true)], all).map((c) => [c.change, c.readiness, c.items])).toEqual([['CHG-12', 'not_ready', ['PAY-1']]]);
    expect(changeReadiness([item('PAY-1', 'ready'), sec('open', false)], all)[0]?.readiness).toBe('ready');
    expect(changeReadiness([item('PAY-1', 'ready'), sec('resolved', true)], all)[0]?.readiness).toBe('ready');
    expect(changeReadiness([sec('open', true)], [req('PAY-100', ['change:CHG-30'], 'epic')]).map((c) => [c.change, c.readiness, c.items])).toEqual([['CHG-30', 'not_ready', []]]);
  });

  it('uses the configured prefix', () => {
    expect(changeReadiness([item('PAY-1', 'ready')], [req('PAY-1', ['chg/CHG-5'])], 'chg/')[0]?.change).toBe('CHG-5');
  });
});

describe('readinessEvents', () => {
  const now = '2026-10-26T10:00:00.123Z';
  const ready = { change: 'CHG-12', readiness: 'ready' as const, openQuestions: 0, items: ['PAY-1'] };

  it('emits readiness.changed in the contract envelope for a new or changed state', () => {
    const { events, sent } = readinessEvents([ready, { ...ready, change: 'CHG-13', readiness: 'not_ready', openQuestions: 2 }], { 'CHG-13': 'ready' }, now);
    const shape = example('event-readiness.changed.json');
    expect(events).toHaveLength(2);
    for (const e of events) expect(Object.keys(e).sort()).toEqual(Object.keys(shape).sort());
    expect(events[0]).toMatchObject({ type: 'readiness.changed', source: 'ci_for_sdlc', contract_version: '0.4.0', occurred_at: '2026-10-26T10:00:00Z', payload: { change: 'CHG-12', readiness: 'ready', open_questions: 0 } });
    expect(events[1]?.payload).toEqual({ change: 'CHG-13', readiness: 'not_ready', open_questions: 2 });
    expect(events[0]?.id).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    expect(events[0]?.id).not.toBe(events[1]?.id);
    expect(sent).toEqual({ 'CHG-12': 'ready', 'CHG-13': 'not_ready' });
  });

  it('emits nothing when the state did not change, and keeps changes that disappeared', () => {
    const { events, sent } = readinessEvents([ready], { 'CHG-12': 'ready', 'CHG-99': 'drift' }, now);
    expect(events).toEqual([]);
    expect(sent).toEqual({ 'CHG-12': 'ready', 'CHG-99': 'drift' });
  });

  it('attaches targets_status and bumps contract_version to 0.12.0 when the change has it (Z7b-1b)', () => {
    const notReady = { change: 'CHG-12', readiness: 'not_ready' as const, openQuestions: 1, items: ['PAY-1'] };
    const status = { overall: 'not_met', checked_at: now, details: [{ name: 'coverage', kind: 'coverage', status: 'not_met', observed: '82%', required: '>= 90%' }] };
    const { events } = readinessEvents([notReady], {}, now, new Map([['CHG-12', status]]));
    expect(events[0]?.contract_version).toBe('0.12.0');
    expect(events[0]?.payload).toMatchObject({ change: 'CHG-12', readiness: 'not_ready', open_questions: 1, targets_status: status });
  });

  it('keeps contract_version 0.4.0 when no targets_status is given', () => {
    const { events } = readinessEvents([ready], {}, now);
    expect(events[0]?.contract_version).toBe('0.4.0');
    expect(events[0]?.payload).not.toHaveProperty('targets_status');
  });
});

describe('parseGateDecided', () => {
  it('accepts the contract example', () => {
    expect(parseGateDecided(example('event-gate.decided.json'))).toEqual({ id: 'evt-gate.decided', change: 'CHG-12', gate: 'B1', outcome: 'approved', decision: 'DEC-42' });
  });

  it.each([
    ['not an object', 'x'],
    ['wrong type', { ...example('event-gate.decided.json'), type: 'gate.requested' }],
    ['wrong source', { ...example('event-gate.decided.json'), source: 'tf' }],
    ['bad change key', { ...example('event-gate.decided.json'), payload: { ...example('event-gate.decided.json').payload, change: 'chg' } }],
    ['bad decision key', { ...example('event-gate.decided.json'), payload: { ...example('event-gate.decided.json').payload, decision: '42' } }],
    ['unknown outcome', { ...example('event-gate.decided.json'), payload: { ...example('event-gate.decided.json').payload, outcome: 'maybe' } }],
    ['missing id', { ...example('event-gate.decided.json'), id: '' }],
  ])('refuses %s', (_why, value) => {
    expect(typeof parseGateDecided(value)).toBe('string');
  });
});

// A2b (docs/PDI-F4-PLAN.md, "A2b"): every step of A2a with a finding.auto_close decision goes to pdi's registry as
// decision.recorded (pdi contract 0.7.0; with its origin since D5, 0.17.0), checked against a copy of pdi's event schema.
describe('decision.recorded (A2b)', () => {
  const schema = JSON.parse(readFileSync(new URL('./fixtures/pdi-contract/0.17.0/event.schema.json', import.meta.url), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const valid = (e: unknown) => {
    const ok = validate(e);
    return ok ? [] : validate.errors!.map((x) => `${x.instancePath} ${x.message}`);
  };
  const base: DecisionRecordedInput = {
    outcome: 'accepted',
    proposalId: 'ans:1a2b3c4d',
    itemKey: 'CHK-202',
    findingId: 'ERR-003:CHK-202',
    question: 'What should happen if the payment API does not respond within 30 seconds?',
    quote: 'If the payment provider does not respond within 30 seconds, the app shows a timeout message.',
    source: { title: 'Payment Failure Handling', url: 'https://wiki.example.com/pages/1004' },
    answer: 'If the payment provider does not respond within 30 seconds, the app shows a timeout message.',
    decidedBy: 'Ann',
    change: 'CHG-12',
    publicUrl: 'https://ci.example.com/',
  };
  const AT = '2026-10-27T12:00:00.123Z';

  it('PDI-A2B-01: the pdi example passes the copied schema', () => {
    expect(valid(JSON.parse(readFileSync(new URL('./fixtures/pdi-contract/0.17.0/event-decision.recorded.json', import.meta.url), 'utf8')))).toEqual([]);
  });

  it('PDI-A2B-02: Accept — the person, the AI draft unedited, the quote and its source, the change', () => {
    const e = decisionRecordedEvent(base, AT);
    expect(valid(e)).toEqual([]);
    expect(e).toEqual({
      id: 'ci-ac-1a2b3c4d-accepted-20261027T120000Z',
      type: 'decision.recorded',
      occurred_at: '2026-10-27T12:00:00Z',
      source: 'ci_for_sdlc',
      contract_version: '0.17.0',
      payload: {
        decision_type: 'finding.auto_close',
        ref: 'CHK-202/ERR-003:CHK-202',
        origin: { app: 'ci_for_sdlc', scope: 'default', local_id: 'CHK-202/ERR-003:CHK-202', url: 'https://ci.example.com/#/item/CHK-202/ERR-003%3ACHK-202' },
        url: 'https://ci.example.com/#/item/CHK-202/ERR-003%3ACHK-202',
        statement: `Closed "${base.question}" with the answer from Payment Failure Handling: ${base.answer}`,
        decided_by: 'Ann',
        drafted_by: 'ai',
        draft_edited: false,
        evidence: [{ text: base.quote, source_url: 'https://wiki.example.com/pages/1004' }],
        change: 'CHG-12',
      },
    });
  });

  it.each([
    ['edited', { answer: 'A timeout message after 30 s.' }, { draft_edited: true, statement: `Closed "${base.question}" with the answer from Payment Failure Handling: A timeout message after 30 s.` }],
    ['rejected', { answer: undefined }, { draft_edited: true, statement: `Rejected the answer from Payment Failure Handling to "${base.question}": «${base.quote}»` }],
    ['reopened', { answer: undefined, supersedes: 'DEC-41', why: 'Wrong flow' }, { draft_edited: true, supersedes: 'DEC-41', why: 'Wrong flow', statement: `Reopened "${base.question}": the answer from Payment Failure Handling did not answer it` }],
  ] as const)('PDI-A2B-03: %s — the person, the draft counted as changed', (outcome, over, expected) => {
    const e = decisionRecordedEvent({ ...base, outcome, ...over }, AT);
    expect(valid(e)).toEqual([]);
    expect(e.payload).toMatchObject({ decided_by: 'Ann', drafted_by: 'ai', ...expected });
    expect(e.id).toBe(`ci-ac-1a2b3c4d-${outcome}-20261027T120000Z`);
  });

  it('PDI-A2B-04: apply — decided by ci_for_sdlc as an automat with its rule, never with draft_edited', () => {
    const e = decisionRecordedEvent({ ...base, outcome: 'applied', decidedBy: 'auto-close', rule: 'auto-close:ERR-003' }, AT);
    expect(valid(e)).toEqual([]);
    expect(e.payload).toMatchObject({ decided_by: 'ci_for_sdlc', drafted_by: 'ai', automation: { level: 1, rule: 'auto-close:ERR-003' } });
    expect(e.payload).not.toHaveProperty('draft_edited');
    expect(e.payload.statement).toBe(`Closed "${base.question}" automatically (auto-close:ERR-003) with the answer from Payment Failure Handling: ${base.answer}`);
  });

  it('PDI-A2B-05: without a change, a source URL or a public URL, those fields are left out; a long ref is cut to 200', () => {
    const e = decisionRecordedEvent({ ...base, change: undefined, source: { title: 'Decision by Ann (2026-10-23)' }, publicUrl: undefined, findingId: `${'X'.repeat(250)}` }, AT);
    expect(valid(e)).toEqual([]);
    expect(e.payload).not.toHaveProperty('change');
    expect(e.payload).not.toHaveProperty('url');
    expect(e.payload.evidence).toEqual([{ text: base.quote }]);
    expect((e.payload.ref as string).length).toBe(200);
  });
});

// F4: a person asks pdi to decide "Approve for implementation" for a change that is not ready (gate.requested).
describe('gate.requested (F4)', () => {
  const schema = JSON.parse(readFileSync(new URL('./fixtures/pdi-contract/0.7.0/event.schema.json', import.meta.url), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const story = (key: string, readiness: ItemAnalysis['readiness'], p: { blocking?: string[]; findingQuestions?: string[]; challenges?: string[] } = {}) =>
    ({
      key,
      type: 'story',
      readiness,
      blockingIssues: p.blocking ?? [],
      findings: [...(p.findingQuestions ?? []).map((text, n) => ({ id: `f${n}`, status: 'open', question: { text } })), { id: 'closed', status: 'resolved', question: { text: 'Closed already?' } }],
      challenges: [...(p.challenges ?? []).map((text, n) => ({ id: `c${n}`, answered: false, question: { text } })), { id: 'done', answered: true, question: { text: 'Answered?' } }],
    }) as unknown as ItemAnalysis;
  const stories = [
    story('PAY-1', 'not_ready', { blocking: ['No error state'], findingQuestions: ['What happens on timeout?', 'What happens on timeout?'], challenges: ['Can a refund be partial?'] }),
    story('PAY-2', 'ready', { findingQuestions: ['Minor wording?'] }),
  ];
  const change = { change: 'CHG-12', readiness: 'not_ready' as const, openQuestions: 1, items: ['PAY-1', 'PAY-2'] };
  const AT = '2026-10-27T12:00:00.123Z';

  it('GR-01: the pdi example passes the copied schema', () => {
    expect(validate(JSON.parse(readFileSync(new URL('./fixtures/pdi-contract/0.7.0/event-gate.requested.json', import.meta.url), 'utf8')))).toBe(true);
  });

  it('GR-02: what blocks the stories not ready, once each, as the questions', () => {
    expect(approvalQuestions(stories)).toEqual(['PAY-1: No error state', 'PAY-1: What happens on timeout?', 'PAY-1: Can a refund be partial?']);
  });

  it('GR-03: the event for approve-for-implementation, valid against the contract', () => {
    const e = gateRequestedEvent({ change, stories, requestedBy: 'Ann', note: ' Ship behind a flag ', publicUrl: 'https://ci.example.com/' }, AT);
    expect(e).toEqual({
      id: 'ci-gate-CHG-12-20261027T120000Z',
      type: 'gate.requested',
      occurred_at: '2026-10-27T12:00:00Z',
      source: 'ci_for_sdlc',
      contract_version: '0.7.0',
      payload: {
        change: 'CHG-12',
        gate: 'approve-for-implementation',
        summary: 'CHG-12: Ann asks to approve it for implementation although 1 of 2 stories not ready — Ship behind a flag',
        artifact: 'stories PAY-1, PAY-2',
        url: 'https://ci.example.com/#/item/PAY-1',
        questions: ['PAY-1: No error state', 'PAY-1: What happens on timeout?', 'PAY-1: Can a refund be partial?'],
      },
    });
    expect(validate(e), JSON.stringify(validate.errors)).toBe(true);
  });

  it('GR-04: drift says so; without a public URL or questions those fields are left out; at most 20 questions', () => {
    const e = gateRequestedEvent({ change: { ...change, readiness: 'drift' }, stories: [story('PAY-2', 'ready')], requestedBy: 'Ann' }, AT);
    expect(e.payload.summary).toBe('CHG-12: Ann asks to approve it for implementation although its approved baseline drifted');
    expect(e.payload).not.toHaveProperty('url');
    expect(e.payload).not.toHaveProperty('questions');
    expect(validate(e)).toBe(true);
    const many = story('PAY-3', 'not_ready', { challenges: Array.from({ length: 30 }, (_, n) => `Question ${n}?`) });
    expect(approvalQuestions([many])).toHaveLength(20);
  });
});

// F5 (docs/WORKSPACES-F5-PLAN.md): one change across the stories of several workspaces.
describe('changes across workspaces (F5)', () => {
  const c = (change: string, readiness: 'ready' | 'not_ready' | 'drift', items: string[], openQuestions = 0) => ({ change, readiness, openQuestions, items });

  it.each([
    ['ready in both', ['ready', 'ready'], 'ready'],
    ['not ready in one', ['ready', 'not_ready'], 'not_ready'],
    ['drift wins', ['drift', 'not_ready'], 'drift'],
  ] as const)('WS-01: %s', (_, [a, b], expected) => {
    expect(mergeChangeReadiness([[c('CHG-12', a, ['PAY-1'], 1)], [c('CHG-12', b, ['APP-7'], 2)]])).toEqual([c('CHG-12', expected, ['PAY-1', 'APP-7'], 3)]);
  });

  it('WS-02: changes only in one workspace stay as they are, ordered by key', () => {
    expect(mergeChangeReadiness([[c('CHG-10', 'ready', ['PAY-1'])], [c('CHG-2', 'not_ready', ['APP-7'])]]).map((x) => x.change)).toEqual(['CHG-2', 'CHG-10']);
  });

  it('WS-03: links, refs and ids of another workspace carry it; default keeps the old form', () => {
    expect(workspacePath()).toBe('');
    expect(workspacePath('default')).toBe('');
    expect(workspacePath('mobile')).toBe('/w/mobile');
    const input: DecisionRecordedInput = { outcome: 'accepted', proposalId: 'ans:1a2b', itemKey: 'APP-7', findingId: 'ERR-003:APP-7', question: 'Q?', quote: 'A.', source: { title: 'Page' }, decidedBy: 'Ann', publicUrl: 'https://ci.example.com' };
    const e = decisionRecordedEvent({ ...input, workspace: 'mobile' }, '2026-10-27T12:00:00Z');
    expect(e.payload).toMatchObject({ ref: 'mobile/APP-7/ERR-003:APP-7', url: 'https://ci.example.com/#/w/mobile/item/APP-7/ERR-003%3AAPP-7' });
    expect(e.id).toBe('ci-ac-mobile-1a2b-accepted-20261027T120000Z');
    expect(decisionRecordedEvent({ ...input, workspace: 'default' }, '2026-10-27T12:00:00Z').payload.ref).toBe('APP-7/ERR-003:APP-7');
    const g = gateRequestedEvent({ change: c('CHG-12', 'not_ready', ['APP-7']), stories: [], requestedBy: 'Ann', publicUrl: 'https://ci.example.com', workspace: 'mobile' }, '2026-10-27T12:00:00Z');
    expect(g.payload.url).toBe('https://ci.example.com/#/w/mobile/item/APP-7');
  });
});

// The newest pdi contract (0.14.0) next to the versions each event was written for: everything ci_for_sdlc sends still
// passes pdi's current event schema, and pdi's current gate.decided example is still read. The events keep their own
// contract_version; this guards against a contract change that would break them.
describe('pdi contract 0.14.0: events sent and received stay valid', () => {
  const dir = new URL('./fixtures/pdi-contract/0.14.0/', import.meta.url);
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(read('event.schema.json'));
  const errors = (e: unknown) => (validate(e) ? [] : validate.errors!.map((x) => `${x.instancePath} ${x.message}`));
  const AT = '2026-11-22T12:00:00.123Z';
  const change = { change: 'CHG-12', readiness: 'not_ready' as const, openQuestions: 1, items: ['PAY-1'] };

  it.each(['event-readiness.changed.json', 'event-gate.requested.json', 'event-gate.decided.json', 'event-decision.recorded.json'])('PDI-C14-01: the pdi example %s passes the copied schema', (name) => {
    expect(errors(read(name))).toEqual([]);
  });

  it('PDI-C14-02: readiness.changed, with and without targets_status', () => {
    // Built the way the gate builds it: from `new Date().toISOString()`, which carries milliseconds.
    const status = targetsStatusOf('CHG-12', { coverage: { min_percent: 90 } }, { changeKey: 'CHG-12', touchedFiles: [], coverage: { percent: 82, missingReport: false, filesConsidered: 1 } }, AT);
    expect(status.checked_at).toBe('2026-11-22T12:00:00Z');
    const plain = readinessEvents([change], {}, AT).events;
    const withTargets = readinessEvents([change], {}, AT, new Map([['CHG-12', status]])).events;
    expect(plain).toHaveLength(1);
    expect(withTargets).toHaveLength(1);
    expect(errors(plain[0])).toEqual([]);
    expect(errors(withTargets[0])).toEqual([]);
  });

  it('PDI-C14-03: gate.requested for approve-for-implementation', () => {
    expect(errors(gateRequestedEvent({ change, stories: [], requestedBy: 'Ann', note: 'Ship behind a flag', publicUrl: 'https://ci.example.com/' }, AT))).toEqual([]);
  });

  // decision.recorded is sent with 0.17.0 since D5 (PDI-D5-08); apart from its origin (new in 0.16.0) nothing changed.
  it.each(['accepted', 'edited', 'rejected', 'reopened', 'applied'] as const)('PDI-C14-04: decision.recorded (%s) without its origin', (outcome) => {
    const input: DecisionRecordedInput = {
      outcome,
      proposalId: 'ans:1a2b3c4d',
      itemKey: 'CHK-202',
      findingId: 'ERR-003:CHK-202',
      question: 'What should happen if the payment API does not respond within 30 seconds?',
      quote: 'If the payment provider does not respond within 30 seconds, the app shows a timeout message.',
      source: { title: 'Payment Failure Handling', url: 'https://wiki.example.com/pages/1004' },
      answer: outcome === 'rejected' || outcome === 'reopened' ? undefined : 'A timeout message after 30 s.',
      decidedBy: outcome === 'applied' ? 'auto-close' : 'Ann',
      change: 'CHG-12',
      publicUrl: 'https://ci.example.com/',
      ...(outcome === 'reopened' ? { supersedes: 'DEC-41', why: 'Wrong flow' } : {}),
      ...(outcome === 'applied' ? { rule: 'auto-close:ERR-003' } : {}),
    };
    const { origin, ...payload } = decisionRecordedEvent(input, AT).payload;
    expect(origin).toBeDefined();
    expect(errors({ ...decisionRecordedEvent(input, AT), contract_version: '0.14.0', payload })).toEqual([]);
  });

  it('PDI-C14-05: gate.decided from pdi 0.14.0 is read as before', () => {
    expect(parseGateDecided(read('event-gate.decided.json'))).toEqual({ id: 'evt-gate.decided', change: 'CHG-12', gate: 'B1', outcome: 'approved', decision: 'DEC-42' });
  });
});

// D5 (docs/PDI-D5-PLAN.md): every decision of DI Definition goes to the suite index in pdi as decision.recorded with its
// origin (pdi contract 0.17.0): a person's answer, accepted risk, dismissal, confirmation and the withdrawal of one.
describe('decision.recorded for every decision (D5, contract 0.17.0)', () => {
  const dir = new URL('./fixtures/pdi-contract/0.17.0/', import.meta.url);
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(read('event.schema.json'));
  const errors = (e: unknown) => (validate(e) ? [] : validate.errors!.map((x) => `${x.instancePath} ${x.message}`));
  const decision: Decision = {
    id: 'a1b2c3d4',
    questionId: 'q-timeout',
    findingId: 'ERR-003:CHK-202',
    itemKey: 'CHK-202',
    topic: 'error handling',
    question: 'What should happen if the payment API does not respond within 30 seconds?',
    answer: 'Show a timeout message and let the user retry.',
    decidedBy: 'Ann',
    decidedAt: '2026-11-23T10:00:00.456Z',
    effect: 'resolve',
    version: 1,
    status: 'active',
  };
  const opts = { publicUrl: 'https://ci.example.com/', change: 'CHG-12' };

  it('PDI-D5-01: the pdi example 0.17.0 passes the copied schema', () => {
    expect(errors(read('event-decision.recorded.json'))).toEqual([]);
  });

  it('PDI-D5-02: a person answers a question — finding.resolve with its origin, the change and a link', () => {
    const e = humanDecisionEvent(decision, opts);
    expect(errors(e)).toEqual([]);
    expect(e).toEqual({
      id: 'ci-dec-a1b2c3d4-resolve-20261123T100000Z',
      type: 'decision.recorded',
      occurred_at: '2026-11-23T10:00:00Z',
      source: 'ci_for_sdlc',
      contract_version: '0.17.0',
      payload: {
        decision_type: 'finding.resolve',
        ref: 'CHK-202/ERR-003:CHK-202',
        origin: { app: 'ci_for_sdlc', scope: 'default', local_id: 'CHK-202/ERR-003:CHK-202', url: 'https://ci.example.com/#/item/CHK-202/ERR-003%3ACHK-202' },
        url: 'https://ci.example.com/#/item/CHK-202/ERR-003%3ACHK-202',
        statement: `Answered "${decision.question}": ${decision.answer}`,
        kind: 'product',
        decided_by: 'Ann',
        drafted_by: 'human',
        change: 'CHG-12',
      },
    });
  });

  it.each([
    ['accept_risk', 'finding.accept_risk', 'triage', `Accepted the risk in "${decision.question}": ${decision.answer}`],
    ['dismiss', 'finding.dismiss', 'triage', `Dismissed "${decision.question}": ${decision.answer}`],
    ['confirm', 'finding.confirm', 'triage', `Confirmed the finding "${decision.question}": ${decision.answer}`],
  ] as const)('PDI-D5-03: %s — its own decision type and kind', (effect, type, kind, statement) => {
    const e = humanDecisionEvent({ ...decision, effect }, opts);
    expect(errors(e)).toEqual([]);
    expect(e.payload).toMatchObject({ decision_type: type, kind, statement });
    expect(e.id).toBe(`ci-dec-a1b2c3d4-${effect}-20261123T100000Z`);
  });

  it('PDI-D5-04: a new version of the answer — the reason as why, supersedes the DEC of the version it replaces', () => {
    const e = humanDecisionEvent({ ...decision, version: 2, changeReason: 'The provider allows 60 s', note: 'Agreed with Bob' }, { ...opts, supersedes: 'DEC-41' });
    expect(errors(e)).toEqual([]);
    expect(e.payload).toMatchObject({ why: 'The provider allows 60 s', supersedes: 'DEC-41' });
    expect(humanDecisionEvent({ ...decision, note: 'Agreed with Bob' }, opts).payload.why).toBe('Agreed with Bob');
  });

  it('PDI-D5-05: an AI draft and the evidence of the decision are kept; another workspace prefixes the ref, not the local id', () => {
    const e = humanDecisionEvent(
      { ...decision, draftedBy: 'ai', draftEdited: true, evidence: [{ source: 'confluence', entityId: '1004', title: 'Payment Failure Handling', url: 'https://wiki.example.com/pages/1004', excerpt: 'Timeout after 30 seconds.' }, { source: 'jira', entityId: 'CHK-202', title: 'CHK-202' }] },
      { ...opts, workspace: 'mobile' },
    );
    expect(errors(e)).toEqual([]);
    expect(e.id).toBe('ci-dec-mobile-a1b2c3d4-resolve-20261123T100000Z');
    expect(e.payload).toMatchObject({
      ref: 'mobile/CHK-202/ERR-003:CHK-202',
      origin: { app: 'ci_for_sdlc', scope: 'mobile', local_id: 'CHK-202/ERR-003:CHK-202', url: 'https://ci.example.com/#/w/mobile/item/CHK-202/ERR-003%3ACHK-202' },
      drafted_by: 'ai',
      draft_edited: true,
      evidence: [{ text: 'Timeout after 30 seconds.', source_url: 'https://wiki.example.com/pages/1004' }],
    });
  });

  it('PDI-D5-06: a withdrawal — finding.withdraw at the time of the withdrawal, by its author, with its reason', () => {
    const withdrawn: Decision = { ...decision, status: 'withdrawn', withdrawnBy: 'Bob', withdrawnAt: '2026-11-24T08:30:00Z', withdrawReason: 'Asked the wrong question' };
    const e = humanDecisionEvent(withdrawn, { ...opts, supersedes: 'DEC-41' });
    expect(errors(e)).toEqual([]);
    expect(e.id).toBe('ci-dec-a1b2c3d4-withdrawn-20261124T083000Z');
    expect(e.occurred_at).toBe('2026-11-24T08:30:00Z');
    expect(e.payload).toMatchObject({ decision_type: 'finding.withdraw', kind: 'triage', decided_by: 'Bob', why: 'Asked the wrong question', supersedes: 'DEC-41', statement: `Withdrew the decision on "${decision.question}" (was: ${decision.answer})` });
  });

  it('PDI-D5-07: without a public https URL there is no link; a question without text names the finding; long fields are cut', () => {
    const e = humanDecisionEvent({ ...decision, question: '', itemKey: 'K'.repeat(150), findingId: 'F'.repeat(150) }, { publicUrl: 'http://localhost:4317' });
    expect(errors(e)).toEqual([]);
    expect(e.payload.origin).toEqual({ app: 'ci_for_sdlc', scope: 'default', local_id: `${'K'.repeat(150)}/${'F'.repeat(150)}`.slice(0, 200) });
    expect(e.payload.url).toBe(`http://localhost:4317/#/item/${'K'.repeat(150)}/${'F'.repeat(150)}`);
    expect(e.payload.statement).toBe(`Answered "${'F'.repeat(150)}": ${decision.answer}`);
    expect((e.payload.ref as string).length).toBe(200);
    expect(pdiOrigin({ itemKey: 'A-1', findingId: 'f1' })).toEqual({ app: 'ci_for_sdlc', scope: 'default', local_id: 'A-1/f1' });
  });

  it.each(['accepted', 'edited', 'rejected', 'reopened', 'applied'] as const)('PDI-D5-08: A2b %s carries the origin of its finding and passes 0.17.0', (outcome) => {
    const e = decisionRecordedEvent(
      { outcome, proposalId: 'ans:1', itemKey: 'CHK-202', findingId: 'ERR-003:CHK-202', question: 'Q?', quote: 'Quote.', source: { title: 'Page' }, answer: 'A.', decidedBy: 'Ann', workspace: 'mobile', ...(outcome === 'applied' && { rule: 'auto-close:ERR-003' }) },
      '2026-11-23T10:00:00Z',
    );
    expect(errors(e)).toEqual([]);
    expect(e.contract_version).toBe('0.17.0');
    expect(e.payload.origin).toEqual({ app: 'ci_for_sdlc', scope: 'mobile', local_id: 'CHK-202/ERR-003:CHK-202' });
  });
});
