import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHANGE_LABEL_PREFIX, changeKeyOf, changeReadiness, parseGateDecided, readinessEvents, type ItemAnalysis, type RequirementItem } from '../src/index.js';

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

  it('is ready only when every story of the change is ready', () => {
    const out = changeReadiness([item('PAY-1', 'ready'), item('PAY-2', 'ready'), item('PAY-3', 'needs_attention')], reqs);
    expect(out).toEqual([
      { change: 'CHG-12', readiness: 'ready', openQuestions: 0, items: ['PAY-1', 'PAY-2'] },
      { change: 'CHG-13', readiness: 'not_ready', openQuestions: 0, items: ['PAY-3'] },
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
