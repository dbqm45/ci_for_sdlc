import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jiraIssueToRequirement, parseAcceptanceCriteria, type AcScenario } from '../src/index.js';

// Expected units come from the pdi contract's story-shape set, pinned at 0.4.0 (copied unchanged from
// pdi/contract/fixtures/story-shape). A mismatch with expected.json is a parser bug or a change request to pdi.
const FIXTURES = new URL('./fixtures/pdi-contract/0.4.0/story-shape/', import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8')) as T;

interface Story {
  id: string;
  lang: 'pl' | 'en';
  title: string;
  description: string;
  acceptance_criteria: string;
  story_points?: number;
}
interface Case {
  fire: string[];
  scenarios: number;
  policy?: { acFormat?: 'gwt' | 'ears' | 'any' | 'off' };
}

const stories = read<{ contract_version: string; stories: Story[] }>('stories.json');
const expected = read<{ contract_version: string; policy: { acFormat: string }; cases: Record<string, Case> }>('expected.json');

/** The story as the Jira connector reads it: AC from a custom field, story points from another. */
const viaConnector = (s: Story) =>
  jiraIssueToRequirement(
    { key: `SS-${s.id.slice(3)}`, fields: { summary: s.title, description: s.description, issuetype: { name: 'Story' }, customfield_ac: s.acceptance_criteria, customfield_sp: s.story_points } },
    'https://example.atlassian.net',
    { acceptanceCriteriaField: 'customfield_ac', storyPointsField: 'customfield_sp' },
  );

const scenariosOf = (s: Story): AcScenario[] => viaConnector(s).acScenarios ?? [];
const distinctMainActions = (sc: AcScenario[]) => new Set(sc.flatMap((x) => x.mainAction ?? [])).size;

/** AC-001 as the contract defines it, used only to check format detection: a unit outside the policy format or GWT without Then. */
const breaksFormat = (sc: AcScenario[], acFormat: string) =>
  acFormat !== 'any' && acFormat !== 'off' && sc.some((x) => x.format !== acFormat || (x.format === 'gwt' && !x.then?.length));

describe('story-shape set (pdi contract 0.4.0)', () => {
  it('ACP-00: the copy is the pinned contract version and every story has an expected case', () => {
    expect(stories.contract_version).toBe('0.4.0');
    expect(expected.contract_version).toBe('0.4.0');
    expect(stories.stories.map((s) => s.id).sort()).toEqual(Object.keys(expected.cases).sort());
  });

  for (const s of stories.stories) {
    const c = expected.cases[s.id]!;
    describe(s.id, () => {
      it(`ACP-01: groups the AC into ${c.scenarios} unit(s) numbered AC-1…AC-n`, () => {
        const sc = scenariosOf(s);
        expect(sc).toHaveLength(c.scenarios);
        expect(sc.map((x) => x.id)).toEqual(sc.map((_, i) => `AC-${i + 1}`));
      });

      it(`ACP-02: format detection agrees with AC-001 ${c.fire.includes('AC-001') ? 'firing' : 'staying silent'}`, () => {
        const sc = scenariosOf(s);
        expect(breaksFormat(sc, c.policy?.acFormat ?? expected.policy.acFormat)).toBe(c.fire.includes('AC-001'));
      });

      it(`ACP-03: ${c.fire.includes('AC-004') ? 'flags' : 'finds no'} extra action in a scenario (AC-004)`, () => {
        expect(scenariosOf(s).some((x) => (x.extraActions ?? []).length > 0)).toBe(c.fire.includes('AC-004'));
      });
    });
  }

  it.each([
    { id: 'SS-01', actions: 1, why: 'main path and error of "doda kartę"' },
    { id: 'SS-06', actions: 1, why: '7 filters of "wyszuka produkty"' },
    { id: 'SS-25', actions: 1, why: 'valid and expired card of "add card"' },
    { id: 'SS-41', actions: 1, why: '6 queries of "search products"' },
    { id: 'SS-21', actions: 2, why: 'add and delete an address' },
    { id: 'SS-08', actions: 4, why: 'add, rename, delete, export a product' },
  ])('ACP-04: $id has $actions distinct main action(s) — $why', ({ id, actions }) => {
    const s = stories.stories.find((x) => x.id === id)!;
    expect(distinctMainActions(scenariosOf(s))).toBe(actions);
  });

  it('ACP-05: story points come from the configured field; none without it', () => {
    for (const s of stories.stories) expect(viaConnector(s).storyPoints).toBe(s.story_points);
  });
});

describe('parseAcceptanceCriteria', () => {
  it('ACP-10: a GWT scenario keeps its parts; And/But extend the section before them', () => {
    const [sc] = parseAcceptanceCriteria([
      'Given the customer has a delivered order',
      'And all its items are in stock',
      'When they reorder it',
      'Then the cart contains the same items',
      'But the old discount is not applied',
    ]);
    expect(sc).toMatchObject({
      id: 'AC-1',
      format: 'gwt',
      given: ['the customer has a delivered order', 'all its items are in stock'],
      when: 'they reorder it',
      then: ['the cart contains the same items', 'the old discount is not applied'],
      mainAction: 'reorder it',
      extraActions: [],
    });
    expect(sc!.text).toBe('Given the customer has a delivered order\nAnd all its items are in stock\nWhen they reorder it\nThen the cart contains the same items\nBut the old discount is not applied');
  });

  it('ACP-11: a one-line PL scenario is split at inline keywords; the second "gdy" is an extra action', () => {
    expect(parseAcceptanceCriteria(['Gdy klient doda produkt i gdy zmieni ilość na 3, wtedy widzi sumę dla 3 sztuk'])).toEqual([
      expect.objectContaining({ format: 'gwt', when: 'klient doda produkt', then: ['widzi sumę dla 3 sztuk'], mainAction: 'doda produkt', extraActions: ['zmieni ilość'] }),
    ]);
  });

  it('ACP-12: EARS sentences are split into state, trigger and response', () => {
    expect(parseAcceptanceCriteria(['While the customer is logged in, when the session expires, the system shall show the login screen.'])).toEqual([
      expect.objectContaining({ format: 'ears', given: ['the customer is logged in'], when: 'the session expires', then: ['the system shall show the login screen'] }),
    ]);
    expect(parseAcceptanceCriteria(['The system shall display only the last 4 digits.'])[0]).toMatchObject({ format: 'ears', then: ['The system shall display only the last 4 digits'] });
  });

  it('ACP-13: a blank entry closes a scenario; free text is one unit per line', () => {
    const sc = parseAcceptanceCriteria(['Given a', 'Then b', '', 'And c', 'Plain sentence about the result.']);
    expect(sc.map((x) => [x.id, x.format])).toEqual([
      ['AC-1', 'gwt'],
      ['AC-2', 'free'],
      ['AC-3', 'free'],
    ]);
  });

  it('ACP-14: "I" starts an And line only in Polish AC; in English it is the pronoun', () => {
    expect(parseAcceptanceCriteria(['Zakładając, że klient ma koszyk', 'I ma kod rabatowy', 'Gdy zapłaci', 'Wtedy widzi rabat'])[0]!.given).toEqual(['klient ma koszyk', 'ma kod rabatowy']);
    expect(parseAcceptanceCriteria(['When I pay', 'Then I see the receipt'])[0]).toMatchObject({ when: 'I pay', mainAction: 'pay' });
  });

  it('ACP-15: no AC, no units', () => {
    expect(parseAcceptanceCriteria([])).toEqual([]);
  });
});
