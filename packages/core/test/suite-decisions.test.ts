import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decisionsTouched, mergeSuiteDecisions, pathMatches, selectSuiteDecisions, suiteDecisionOf, type SuiteDecisionCache } from '../src/index.js';

/** The applies_to matching cases every implementation must pass (pdi contract 0.22.0, decision-record.md §4a). */
const CASES = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/pdi-contract/0.22.0/applies-to-cases.json', import.meta.url)), 'utf8')) as {
  cases: { pattern: string; path: string; match: boolean }[];
};

// D9 (docs/PDI-D9-PLAN.md): a read-only copy of the suite decision index from pdi (`pdi-records changes`, pdi D7),
// shown in DI Definition next to the findings and questions it may concern.

/** One decision as `pdi-records changes` gives it: the registry entry, `changed_at` and the Decision Record `text`. */
function dec(id: string, statement: string, over: Record<string, unknown> = {}) {
  return {
    id,
    statement,
    why: 'Because the team agreed.',
    decided_at: '2026-11-20',
    decided_by: 'po',
    kind: 'product',
    status: 'recorded',
    decision_type: 'gate.decided',
    source: { kind: 'manual', url: 'https://pdi.example.com/decisions/' + id },
    changed_at: '2026-11-20T09:00:00Z',
    text: '---\nrecord: decision\n---\n',
    ...over,
  };
}

describe('suite decisions copy (D9)', () => {
  it('SD-01: an entry from pdi becomes a suite decision with its app, state, change and link; the file text is not kept', () => {
    expect(suiteDecisionOf(dec('DEC-41', 'Approve CHG-12 for implementation', { links: { chg: 'CHG-12' } }))).toEqual({
      id: 'DEC-41',
      statement: 'Approve CHG-12 for implementation',
      why: 'Because the team agreed.',
      status: 'recorded',
      app: 'pdi',
      type: 'gate.decided',
      decidedAt: '2026-11-20',
      decidedBy: 'po',
      change: 'CHG-12',
      link: 'https://pdi.example.com/decisions/DEC-41',
      changedAt: '2026-11-20T09:00:00Z',
    });
    const tf = suiteDecisionOf(dec('DEC-42', 'Postgres as the event queue', { origin: { app: 'tf', scope: 'dbqm45/shop', local_id: 'D-001', url: 'https://github.com/dbqm45/shop/blob/abc/docs/project/decisions.md' } }))!;
    expect(tf).toMatchObject({ app: 'tf', scope: 'dbqm45/shop', localId: 'D-001', link: 'https://github.com/dbqm45/shop/blob/abc/docs/project/decisions.md' });
  });

  it.each([
    ['no id', { id: '' }],
    ['a bad id', { id: 'dec 1' }],
    ['no statement', { statement: 42 }],
    ['not an object', null],
  ])('SD-02: refuses an entry with %s', (_why, over) => {
    expect(suiteDecisionOf(over === null ? null : dec('DEC-1', 'x', over))).toBeUndefined();
  });

  it('SD-03: a link that is not https is dropped', () => {
    expect(suiteDecisionOf(dec('DEC-1', 'x', { source: { kind: 'manual', url: 'javascript:alert(1)' } }))).not.toHaveProperty('link');
  });

  it('SD-04: merging keeps the cursor, replaces changed decisions, keeps superseded ones and skips our own', () => {
    let cache: SuiteDecisionCache = { decisions: [] };
    cache = mergeSuiteDecisions(cache, [dec('DEC-1', 'Free delivery from 199'), dec('DEC-2', 'Ours', { origin: { app: 'ci_for_sdlc', scope: 'default', local_id: 'PAY-1/ERR-001:PAY-1' } }), { junk: true }], '2026-11-20T09:00:00Z/DEC-2', '2026-11-23T10:00:00Z');
    expect(cache.decisions.map((d) => d.id)).toEqual(['DEC-1']);
    expect(cache).toMatchObject({ next: '2026-11-20T09:00:00Z/DEC-2', fetchedAt: '2026-11-23T10:00:00Z' });
    cache = mergeSuiteDecisions(cache, [dec('DEC-1', 'Free delivery from 199', { status: 'superseded', superseded_by: 'DEC-3', changed_at: '2026-11-22T09:00:00Z' }), dec('DEC-3', 'Free delivery from 149', { changed_at: '2026-11-22T09:00:00Z' })], '2026-11-22T09:00:00Z/DEC-3', '2026-11-23T11:00:00Z');
    expect(cache.decisions.map((d) => [d.id, d.status, d.supersededBy])).toEqual([['DEC-1', 'superseded', 'DEC-3'], ['DEC-3', 'recorded', undefined]]);
    expect(cache.next).toBe('2026-11-22T09:00:00Z/DEC-3');
    expect(mergeSuiteDecisions(cache, [], undefined, '2026-11-23T12:00:00Z').next).toBe('2026-11-22T09:00:00Z/DEC-3');
  });

  it('SD-05: selecting by change or by words — fragments, any case, binding ones first, at most the limit', () => {
    const all = mergeSuiteDecisions({ decisions: [] }, [
      dec('DEC-1', 'Free delivery from 199', { status: 'superseded', superseded_by: 'DEC-3', links: { chg: 'CHG-12' } }),
      dec('DEC-2', 'Event queue on Postgres', { why: 'One database less' }),
      dec('DEC-3', 'Free delivery from 149', { links: { chg: 'CHG-12' } }),
      dec('DEC-4', 'Approve CHG-13', { links: { chg: 'CHG-13' } }),
    ], undefined, '2026-11-23T10:00:00Z').decisions;
    expect(selectSuiteDecisions(all, { change: 'CHG-12' }).map((d) => d.id)).toEqual(['DEC-3', 'DEC-1']);
    expect(selectSuiteDecisions(all, { q: 'DELIV 149' }).map((d) => d.id)).toEqual(['DEC-3']);
    expect(selectSuiteDecisions(all, { q: 'database' }).map((d) => d.id)).toEqual(['DEC-2']);
    expect(selectSuiteDecisions(all, { q: 'dec-4' }).map((d) => d.id)).toEqual(['DEC-4']);
    expect(selectSuiteDecisions(all, { change: 'CHG-12', q: '199' }).map((d) => d.id)).toEqual(['DEC-1']);
    expect(selectSuiteDecisions(all, {})).toEqual([]);
    expect(selectSuiteDecisions(all, { q: 'free', limit: 1 })).toHaveLength(1);
  });

  it('SD-06: the copy keeps applies_to, review_by and the load-bearing assumptions; a bad applies_to is dropped', () => {
    const d = suiteDecisionOf(dec('DEC-7', 'Bulk changes go through a job queue', {
      applies_to: { paths: ['services/bulk/**'], components: ['bulk'] },
      review_by: '2026-12-01',
      assumptions: [
        { statement: 'Chargers answer within 30 s', load_bearing: true, invalidated_if: 'timeouts above 5%' },
        { statement: 'Minor', load_bearing: false, invalidated_if: 'x' },
      ],
    }))!;
    expect(d).toMatchObject({ appliesTo: { paths: ['services/bulk/**'], components: ['bulk'] }, reviewBy: '2026-12-01', assumptions: [{ statement: 'Chargers answer within 30 s', invalidatedIf: 'timeouts above 5%' }] });
    expect(suiteDecisionOf(dec('DEC-8', 'x', { applies_to: { paths: ['/etc/passwd', '../x', 7] } }))).not.toHaveProperty('appliesTo');
    expect(suiteDecisionOf(dec('DEC-9', 'x', { applies_to: { paths: ['ok/**', '../no'] } }))!.appliesTo).toEqual({ paths: ['ok/**'] });
  });

  it.each(CASES.cases)('SD-07: $pattern ~ $path → $match (contract case)', ({ pattern, path, match }) => {
    expect(pathMatches(pattern, path)).toBe(match);
  });

  it('SD-08: the decisions a pull request touches — binding ones with the files they cover, by id', () => {
    const all = mergeSuiteDecisions({ decisions: [] }, [
      dec('DEC-10', 'Bulk via a job queue', { applies_to: { paths: ['services/bulk/**'] } }),
      dec('DEC-3', 'Only the OCPP adapter calls chargers', { applies_to: { paths: ['services/**/ocpp*.ts', 'services/bulk'] } }),
      dec('DEC-4', 'Old', { status: 'superseded', superseded_by: 'DEC-10', applies_to: { paths: ['services/bulk/**'] } }),
      dec('DEC-5', 'Not pinned to code'),
    ], undefined, '2026-11-24T10:00:00Z').decisions;
    const hits = decisionsTouched(all, ['services/bulk/queue.ts', 'services/bulk/ocpp-client.ts', 'README.md'], '2026-11-24');
    expect(hits.map((h) => [h.decision.id, h.files])).toEqual([
      ['DEC-3', ['services/bulk/queue.ts', 'services/bulk/ocpp-client.ts']],
      ['DEC-10', ['services/bulk/queue.ts', 'services/bulk/ocpp-client.ts']],
    ]);
    expect(decisionsTouched(all, ['docs/a.md'], '2026-11-24')).toEqual([]);
  });

  it('SD-09: a decision past its review date is marked for reconsideration', () => {
    const all = mergeSuiteDecisions({ decisions: [] }, [dec('DEC-1', 'x', { applies_to: { paths: ['a'] }, review_by: '2026-11-01' }), dec('DEC-2', 'y', { applies_to: { paths: ['a'] }, review_by: '2026-12-01' })], undefined, 't').decisions;
    expect(decisionsTouched(all, ['a/b.ts'], '2026-11-24').map((h) => [h.decision.id, h.reviewDue])).toEqual([['DEC-1', true], ['DEC-2', false]]);
  });
});
