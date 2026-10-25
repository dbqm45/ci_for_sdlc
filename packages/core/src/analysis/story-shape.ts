import type { AcScenario, RequirementItem } from '../model.js';
import { storyShapeOf } from '../policy.js';
import { parseAcceptanceCriteria } from './acceptance.js';
import { evJira, type ItemCtx } from './context.js';
import type { FindingDraft, Rule } from './rules.js';
import { IMPLEMENTATION_TERMS, LAYER_TERMS, VAGUE_TERMS, WEAK_RESULTS } from './vocabulary.js';

/**
 * Story-shape rules (plan G1/G2 §4.2, step G2.2): one path per story, a size a team can finish, value instead of a
 * layer, and acceptance criteria that are scenarios with an observable result. The expected behaviour is pinned by the
 * pdi contract 0.4.0 story-shape set (test/story-shape.test.ts). The rules ask a question; they never rewrite.
 */

const scenariosOf = (c: ItemCtx): AcScenario[] => c.r.acScenarios ?? parseAcceptanceCriteria(c.r.acceptanceCriteria);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const quoteOf = (sc: AcScenario) => sc.text.split('\n')[0]!.slice(0, 120);
const evUnit = (c: ItemCtx, sc: AcScenario) => evJira(c.r, new RegExp(escapeRe(quoteOf(sc).slice(0, 40)), 'i'));

// ---------------------------------------------------------------------------- the story statement

/** "Jako <aktor> chcę <cel>, aby <po co>" / "As a <actor> I want to <goal> so that <why>". */
export interface StoryStatement {
  actors: string[];
  goal: string;
  lang: 'pl' | 'en';
}

const PL_STATEMENT = /\bjako\s+(.+?)\s+(?:chcę|chciał(?:a|bym|abym)|potrzebuję|mogę)\s+(.+?)(?:,?\s+(?:aby|żeby|by|abym|żebym)\s+.+)?$/iu;
const EN_STATEMENT = /\bas\s+(?:an?\s+)?(.+?),?\s+i\s+(?:want|would like|need|can)\s+(?:to\s+)?(.+?)(?:,?\s+(?:so that|in order to)\s+.+)?$/iu;
const ACTOR_SPLIT = /\s*(?:,|\blub\b|\balbo\b|\boraz\b|\bi\b|\bor\b|\band\b)\s*/iu;

/** The first line of the description that reads as a user story statement. */
export function storyStatement(description: string): StoryStatement | undefined {
  for (const line of description.split('\n')) {
    const text = line.trim().replace(/\.+$/, '');
    const pl = PL_STATEMENT.exec(text);
    const en = pl ? null : EN_STATEMENT.exec(text);
    const m = pl ?? en;
    if (!m) continue;
    const actors = m[1]!.split(ACTOR_SPLIT).map((a) => a.replace(/^(?:an?|the)\s+/i, '').trim()).filter(Boolean);
    return { actors, goal: m[2]!.trim(), lang: pl ? 'pl' : 'en' };
  }
  return undefined;
}

const DETERMINER = new Set('a an the my your his her its our their this that these those some all any every no each'.split(' '));
const CONJ = /\s*(?:,|\bi\b|\boraz\b|\blub\b|\balbo\b|\band\b|\bor\b)\s*/iu;
const plInfinitive = (w: string) => /(?:ć|c)$/u.test(w) && w.length > 3;

/**
 * The separate actions joined in a title or goal ("dodać, edytować i usunąć kartę", "create, edit and delete
 * addresses", "Eksport/import"). Conjunctions count only between verbs: "numer i datę" or "the price and the date"
 * join objects, not actions.
 */
export function joinedActions(text: string, lang: 'pl' | 'en', title = false): string[] {
  const slash = /(\p{L}+)\/(\p{L}+)/u.exec(text);
  if (slash) return [slash[1]!, slash[2]!];
  const segs = text
    .replace(/^to\s+/i, '')
    .split(CONJ)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length < 2) return [];
  const first = (s: string) => s.split(/\s+/)[0]!.toLowerCase();
  let verbs: string[];
  if (lang === 'pl') verbs = segs.filter((s) => plInfinitive(first(s))).map(first);
  else {
    // A title lists actions only when it starts with one ("Create, edit and delete …"), not with the actor.
    if (title && segs[0]!.split(/\s+/).length > 1) return [];
    verbs = segs.filter((s, i) => !DETERMINER.has(first(s)) && (i === 0 || segs[i - 1]!.split(/\s+/).length === 1 || s.split(/\s+/).length > 1)).map(first);
  }
  return verbs.length >= 2 ? verbs : [];
}

const firstWord = (title: string) => (title.trim().split(/\s+/)[0] ?? '').replace(/[:.,]+$/, '');
const layerOf = (title: string) => {
  const w = firstWord(title);
  return LAYER_TERMS.caseSensitive.includes(w) || LAYER_TERMS.caseInsensitive.includes(w.toLowerCase()) ? w : undefined;
};
const implementationTerm = (text: string) => {
  for (const t of IMPLEMENTATION_TERMS) {
    const m = t.pattern.exec(text);
    if (m) return { category: t.category, term: m[0] };
  }
  return undefined;
};

/**
 * STORY-003's signal, also read by REL-004 and REL-006: the title starts with a technical layer, or the story has no
 * actor and uses technical vocabulary.
 */
export function technicalLayer(r: Pick<RequirementItem, 'title' | 'description'>): { layer?: string; tech?: { category: string; term: string } } | undefined {
  const layer = layerOf(r.title);
  const tech = !storyStatement(r.description) ? implementationTerm(`${r.title}\n${r.description}`) : undefined;
  return layer || tech ? { layer, tech } : undefined;
}

const mainActions = (sc: AcScenario[]) => [...new Set(sc.flatMap((s) => (s.format === 'gwt' && s.mainAction ? [s.mainAction] : [])))];

// ---------------------------------------------------------------------------- rules

export const STORY_SHAPE_RULES: Rule[] = [
  {
    id: 'STORY-001',
    name: 'One user action per story',
    description: 'A story covers one path of one actor: actions joined in the title or goal, several actors, or scenarios with different main actions mean several stories.',
    appliesTo: ['story'],
    run: (c) => {
      const st = storyStatement(c.r.description);
      const lang = st?.lang ?? (/\b(the|and|or|to)\b/i.test(c.r.title) ? 'en' : 'pl');
      const signals: string[] = [];
      const inTitle = joinedActions(c.r.title, lang, true);
      if (inTitle.length) signals.push(`the title joins ${inTitle.length} actions (${inTitle.join(', ')})`);
      const inGoal = st ? joinedActions(st.goal, st.lang) : [];
      if (inGoal.length) signals.push(`the goal joins ${inGoal.length} actions (${inGoal.join(', ')})`);
      if (st && st.actors.length > 1) signals.push(`it names ${st.actors.length} actors (${st.actors.join(', ')})`);
      const actions = mainActions(scenariosOf(c));
      if (actions.length >= 2) signals.push(`its scenarios have ${actions.length} different main actions (${actions.join(', ')})`);
      if (!signals.length) return [];
      const count = Math.max(inTitle.length, inGoal.length, actions.length, st?.actors.length ?? 1);
      return [
        {
          category: 'AMBIGUITY',
          severity: 'warning',
          dimension: 'requirements',
          title: 'Story covers more than one user action',
          explanation: `"${c.r.title}" ${signals.join('; ')}. One story should deliver one path for one actor, so it can be estimated, tested and released on its own.`,
          evidence: [evJira(c.r)],
          question: { text: `Split "${c.r.title}" into ${count} stories?`, options: ['Split by action (one story per action or actor)', 'Keep as one path (add the reason in a note)'], topic: 'story shape' },
        },
      ];
    },
  },
  {
    id: 'STORY-002',
    name: 'Story size',
    description: 'A story with more scenarios or distinct actions than the policy allows, or a large estimate, is too big for one iteration.',
    appliesTo: ['story'],
    run: (c) => {
      const p = storyShapeOf(c.env.policy);
      // Scenarios only: free-text points of a criteria list are not counted (AC written as a list: docs/BACKLOG-DEFERRED.md, G2-L1).
      const sc = scenariosOf(c).filter((s) => s.format !== 'free');
      const actions = mainActions(sc);
      const why: string[] = [];
      if (sc.length > p.maxScenarios) why.push(`${sc.length} acceptance scenarios (limit ${p.maxScenarios})`);
      if (actions.length > p.maxActions) why.push(`${actions.length} different main actions (limit ${p.maxActions})`);
      if (c.r.storyPoints !== undefined && c.r.storyPoints >= p.maxStoryPoints) why.push(`an estimate of ${c.r.storyPoints} story points (limit below ${p.maxStoryPoints})`);
      if (!why.length) return [];
      return [
        {
          category: 'AMBIGUITY',
          severity: 'warning',
          dimension: 'requirements',
          title: 'Story is too large',
          explanation: `"${c.r.title}" has ${why.join(', ')}. Large stories hide risk and rarely finish in one iteration.`,
          evidence: [evJira(c.r)],
          question: { text: `How should "${c.r.title}" be split?`, options: ['By path or action', 'By data variant or business rule', 'By interface or platform', 'Keep the size (add the reason in a note)'], topic: 'story shape' },
        },
      ];
    },
  },
  {
    id: 'STORY-003',
    name: 'Value, not a layer',
    description: 'A story named after a technical layer, or without an actor while using technical vocabulary, is a task.',
    appliesTo: ['story'],
    run: (c) => {
      const signal = technicalLayer(c.r);
      if (!signal) return [];
      const { layer, tech } = signal;
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'requirements',
          title: 'Story describes a technical layer',
          explanation: layer
            ? `The title starts with "${layer}", a technical layer. A story describes value for a user; work on one layer is a task under a story.`
            : `The story has no actor and uses technical vocabulary ("${tech!.term}"). A story describes value for a user; this reads as a task.`,
          evidence: [evJira(c.r)],
          question: { text: `Is "${c.r.title}" a task under another story, or should it be rewritten as value for a user?`, options: ['Move it as a task under a story', 'Rewrite it as a user story'], topic: 'story shape' },
        },
      ];
    },
  },
  {
    id: 'AC-001',
    name: 'Acceptance criteria format',
    description: 'Every acceptance criterion is a scenario in the format set in the policy (GWT by default); free text or a scenario without Then breaks it.',
    appliesTo: ['story'],
    run: (c) => {
      const { acFormat } = storyShapeOf(c.env.policy);
      if (acFormat === 'any' || acFormat === 'off') return [];
      const bad = scenariosOf(c).filter((s) => s.format !== acFormat || (s.format === 'gwt' && !s.then?.length));
      if (!bad.length) return [];
      const name = acFormat === 'gwt' ? 'Given/When/Then' : 'EARS';
      return [
        {
          category: 'AMBIGUITY',
          severity: 'info',
          dimension: 'requirements',
          title: `Acceptance criteria not in ${name} format (${bad.map((s) => s.id).join(', ')})`,
          explanation: `${bad.map((s) => `${s.id} "${quoteOf(s)}" is ${s.format === 'gwt' ? 'a scenario without Then' : s.format === 'free' ? 'free text' : `${s.format.toUpperCase()}`}`).join('; ')}. ${name} criteria state the starting condition, the single action and the observable result, so they can be tested as written.`,
          evidence: bad.slice(0, 3).map((s) => evUnit(c, s)),
          question: { text: `Rewrite ${bad.map((s) => s.id).join(', ')} of "${c.r.title}" as ${name} scenarios?`, options: ['Product will rewrite them in Jira', 'Keep as they are (add the reason in a note)'], topic: 'acceptance criteria' },
        },
      ];
    },
  },
  {
    id: 'AC-002',
    name: 'Observable result',
    description: 'A criterion must name a state the user or the system can observe, not "works" or "is handled correctly". Criteria already flagged by REQ-003 are skipped.',
    appliesTo: ['story'],
    run: (c) => {
      const out: FindingDraft[] = [];
      for (const s of scenariosOf(c)) {
        if (VAGUE_TERMS.some((v) => v.pattern.test(s.text))) continue;
        const lower = s.text.toLowerCase();
        const weak = WEAK_RESULTS.find((w) => lower.includes(w));
        if (!weak) continue;
        out.push({
          disc: s.id,
          category: 'AMBIGUITY',
          severity: 'warning',
          dimension: 'requirements',
          title: `${s.id}: result "${weak}" is not observable`,
          explanation: `${s.id} "${quoteOf(s)}" ends in "${weak}", which nobody can check. A result names what the user sees or what the system records.`,
          evidence: [evUnit(c, s)],
          question: { text: `What exactly does the user see, or what does the system record, in ${s.id} of "${c.r.title}"?`, options: ['Product will state the observable result in Jira', 'Remove the criterion'], topic: 'acceptance criteria' },
        });
      }
      return out.slice(0, 4);
    },
  },
  {
    id: 'AC-003',
    name: 'Behaviour, not implementation',
    description: 'A criterion that names a provider, a data structure, a protocol or a mechanism describes implementation; the detail belongs to a task.',
    appliesTo: ['story'],
    run: (c) =>
      scenariosOf(c)
        .flatMap((s): FindingDraft[] => {
          const hit = implementationTerm(s.text);
          if (!hit) return [];
          return [
            {
              disc: s.id,
              category: 'AMBIGUITY',
              severity: 'info',
              dimension: 'requirements',
              title: `${s.id}: describes implementation ("${hit.term}")`,
              explanation: `${s.id} "${quoteOf(s)}" names a ${hit.category} ("${hit.term}"). Acceptance criteria describe behaviour; the technical detail belongs to a task.`,
              evidence: [evUnit(c, s)],
              question: { text: `What behaviour should ${s.id} of "${c.r.title}" describe instead of "${hit.term}"?`, options: ['Rewrite as behaviour, move the detail to a task', 'Keep: the detail is a requirement (add the reason in a note)'], topic: 'acceptance criteria' },
            },
          ];
        })
        .slice(0, 4),
  },
  {
    id: 'AC-004',
    name: 'One action per scenario',
    description: 'A scenario with a second When, or And directly after When, tests more than one action.',
    appliesTo: ['story'],
    run: (c) =>
      scenariosOf(c).flatMap((s): FindingDraft[] =>
        s.format === 'gwt' && s.extraActions?.length
          ? [
              {
                disc: s.id,
                category: 'AMBIGUITY',
                severity: 'info',
                dimension: 'requirements',
                title: `${s.id}: more than one action in one scenario`,
                explanation: `${s.id} tests "${s.mainAction}" and also ${s.extraActions.map((a) => `"${a}"`).join(', ')}. One scenario should exercise one action, so a failure points at one behaviour.`,
                evidence: [evUnit(c, s)],
                question: { text: `Split ${s.id} of "${c.r.title}" into one scenario per action?`, options: ['Split the scenario', 'Keep: the actions form one step (add the reason in a note)'], topic: 'acceptance criteria' },
              },
            ]
          : [],
      ),
  },
];
