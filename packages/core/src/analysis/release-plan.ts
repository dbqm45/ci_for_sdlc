import type { ReleasePlan, RequirementItem } from '../model.js';
import { workItemsUnder } from '../hierarchy.js';
import { releaseOf } from '../policy.js';
import { evJira, hasUi, type ItemCtx } from './context.js';
import type { Rule } from './rules.js';
import { technicalLayer } from './story-shape.js';

/**
 * Release-plan rules REL-001…006 (plan G1/G2 §5.3, step G1.2) on epics and features in Jira mode. The plan is read
 * from conventions (pdi contract 0.4.0, DG4): each story's release line R1…Rn (R1 = MVP, `release:R1` labels by
 * default), the "MVP" section of the epic's description, and the stories' feature flags (as ShipScope links them).
 * Findings land in the `delivery` dimension ("Release plan") of the epic. REL-004 checks only the technical-layer
 * signal; the AI check of a missing flow step and REL-007/008 (repo mode) come later.
 */

export const MVP_LINE = 'R1';
/** REL-001 and REL-003 apply from this many stories: below it an MVP split is not worth asking for. */
export const MIN_STORIES_FOR_MVP = 3;

/** A release line id from a label value, fix version or field: "R1", "r2", "R 3" → R1, R2, R3. */
export function releaseLineOf(value: string): string | undefined {
  const m = /^R\s*0*(\d+)$/i.exec(value.trim());
  return m ? `R${m[1]}` : undefined;
}

const lineNo = (id: string) => Number(id.slice(1));

/** The release lines of the stories under an epic or feature (also through features). */
export function releasePlanOf(childrenOf: Map<string, RequirementItem[]>, key: string): ReleasePlan {
  const stories = workItemsUnder(childrenOf, key);
  const byLine = new Map<string, string[]>();
  const unassigned: string[] = [];
  for (const s of stories) {
    if (s.releaseLine) (byLine.get(s.releaseLine) ?? byLine.set(s.releaseLine, []).get(s.releaseLine)!).push(s.key);
    else unassigned.push(s.key);
  }
  const lines = [...byLine].map(([id, keys]) => ({ id, stories: keys })).sort((a, b) => lineNo(a.id) - lineNo(b.id));
  const mvp = byLine.get(MVP_LINE)?.length ?? 0;
  return { lines, unassigned, stories: stories.length, mvpPercent: stories.length ? Math.round((mvp * 100) / stories.length) : null };
}

// ---------------------------------------------------------------------------- MVP section

const L = '(?![\\p{L}\\p{N}])';
/** A threshold: a percentage, a comparison or "at least 25". */
const THRESHOLD = new RegExp(`\\d+(?:[.,]\\d+)?\\s*%|[<>≥≤]=?\\s*\\d|(?:at least|at most|no more than|no less than|up to|co najmniej|najwyżej|nie więcej niż|nie mniej niż|minimum|maksimum|do)\\s+\\d|from\\s+\\d+.*\\bto\\s+\\d|z\\s+\\d+.*\\sdo\\s+\\d`, 'iu');
/** A horizon: "within 30 days", "w ciągu 3 miesięcy", "after 2 weeks", "horizon". */
const HORIZON = new RegExp(`\\d+\\s*(?:days?|weeks?|months?|quarters?|years?|dni|dzień|tydzień|tygodni\\p{L}*|miesiąc\\p{L}*|miesięcy|kwarta\\p{L}*|lat)${L}|horizon|horyzont`, 'iu');
const METRIC_WORD = /metric|kpi|measure|metryk|miar|wskaźnik/i;

/** What the MVP section lacks: its outcome, a metric threshold, a horizon. */
function mvpGaps(mvp: string | undefined): string[] {
  if (!mvp?.trim()) return ['the epic has no "MVP" section with the outcome and metric of R1'];
  const sentences = mvp.split(/[.\n;]+/).map((s) => s.trim()).filter(Boolean);
  const gaps: string[] = [];
  if (!sentences.some((s) => !METRIC_WORD.test(s) && !THRESHOLD.test(s) && s.split(/\s+/).length >= 3)) gaps.push('it states no outcome for users');
  if (!THRESHOLD.test(mvp)) gaps.push('its metric has no threshold (e.g. "at least 25%")');
  if (!HORIZON.test(mvp)) gaps.push('its metric has no horizon (e.g. "within 30 days")');
  return gaps;
}

// ---------------------------------------------------------------------------- rules

const DONE = /^(done|closed|resolved|released|gotowe|zamknięte|zakończone)$/i;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function planOf(c: ItemCtx) {
  const plan = releasePlanOf(c.env.childrenOf, c.r.key);
  const stories = workItemsUnder(c.env.childrenOf, c.r.key);
  const inLine = (id: string) => stories.filter((s) => s.releaseLine === id);
  return { plan, stories, mvp: inLine(MVP_LINE) };
}

/** Issues that block `s`: its own "is blocked by" links and other issues' "blocks" links to it. */
function blockersOf(c: ItemCtx, s: RequirementItem): RequirementItem[] {
  const keys = new Set(s.links.filter((l) => /^is blocked by$/i.test(l.type)).map((l) => l.key));
  for (const r of c.env.ctx.requirements) if (r.links.some((l) => /^blocks$/i.test(l.type) && l.key === s.key)) keys.add(r.key);
  return [...keys].flatMap((k) => c.env.reqByKey.get(k) ?? []);
}

const needsFlag = (s: RequirementItem, mode: 'user_facing' | 'all') => mode === 'all' || (hasUi(s) && !technicalLayer(s));

export const RELEASE_RULES: Rule[] = [
  {
    id: 'REL-001',
    name: 'MVP designated',
    description: `An epic or feature with ${MIN_STORIES_FOR_MVP} or more stories marks its MVP: the stories of release line R1.`,
    appliesTo: ['epic', 'feature'],
    run: (c) => {
      const { stories, mvp } = planOf(c);
      if (stories.length < MIN_STORIES_FOR_MVP || mvp.length) return [];
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'delivery',
          title: 'MVP is not designated',
          explanation: `None of the ${stories.length} stories is in release line R1, so it is not known which of them must ship first to reach the outcome. Mark them with the label release:R1.`,
          evidence: [evJira(c.r)],
          question: { text: 'Which stories make up the MVP (release R1)?', options: ['Product will mark the MVP stories with release:R1', 'The epic ships as one release'], topic: 'release plan' },
        },
      ];
    },
  },
  {
    id: 'REL-002',
    name: 'MVP outcome and metric',
    description: 'The "MVP" section of the epic states the outcome for users and a metric with a threshold and a horizon.',
    appliesTo: ['epic', 'feature'],
    run: (c) => {
      const { mvp } = planOf(c);
      if (!mvp.length && !c.r.mvp?.trim()) return [];
      const gaps = mvpGaps(c.r.mvp);
      if (!gaps.length) return [];
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'delivery',
          title: 'MVP has no outcome or measurable metric',
          explanation: `${gaps.join('; ').replace(/^./, (x) => x.toUpperCase())}. Without them nobody can tell whether release R1 worked.`,
          evidence: [evJira(c.r)],
          question: { text: `What outcome and metric (threshold and horizon) define the MVP of "${c.r.title}"?`, options: ['Product will add the "MVP" section to the epic'], topic: 'release plan' },
        },
      ];
    },
  },
  {
    id: 'REL-003',
    name: 'MVP is a slice, not everything',
    description: 'Release line R1 holds no more than the policy share of the stories (60% by default).',
    appliesTo: ['epic', 'feature'],
    run: (c) => {
      const { plan, stories, mvp } = planOf(c);
      const { maxMvpPercent } = releaseOf(c.env.policy);
      if (stories.length < MIN_STORIES_FOR_MVP || !mvp.length || (plan.mvpPercent ?? 0) <= maxMvpPercent) return [];
      return [
        {
          category: 'AMBIGUITY',
          severity: 'warning',
          dimension: 'delivery',
          title: `MVP holds ${mvp.length} of ${stories.length} stories (${plan.mvpPercent}%)`,
          explanation: `Release line R1 holds more than ${maxMvpPercent}% of the stories, so the MVP is close to the whole epic and reaches users late.`,
          evidence: [evJira(c.r)],
          question: { text: `The MVP holds ${mvp.length} of ${stories.length} stories. What can wait for a later release?`, options: ['Product will move stories to R2', 'All of them are needed for the outcome'], topic: 'release plan' },
        },
      ];
    },
  },
  {
    id: 'REL-004',
    name: 'MVP is an end-to-end slice',
    description: 'Release line R1 holds stories that deliver value to users, not work on one technical layer (STORY-003).',
    appliesTo: ['epic', 'feature'],
    run: (c) => {
      const layered = planOf(c).mvp.filter((s) => technicalLayer(s));
      if (!layered.length) return [];
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'delivery',
          title: `MVP holds ${plural(layered.length, 'technical-layer story', 'technical-layer stories')}`,
          explanation: `${layered.map((s) => `${s.key} "${s.title}"`).join(', ')} in release line R1 ${layered.length === 1 ? 'describes' : 'describe'} one technical layer. The MVP is a thin slice through the whole flow that a user can try.`,
          evidence: [evJira(c.r), ...layered.slice(0, 3).map((s) => evJira(s))],
          question: { text: 'Which user-facing step does the MVP deliver with this work?', options: ['Product will rewrite them as user stories', 'Move them as tasks under an MVP story'], topic: 'release plan' },
        },
      ];
    },
  },
  {
    id: 'REL-005',
    name: 'Dependencies follow the release order',
    description: 'A story in R1 is not blocked by a story of a later release line or without a line.',
    appliesTo: ['epic', 'feature'],
    run: (c) =>
      planOf(c).mvp.flatMap((s) =>
        blockersOf(c, s)
          .filter((b) => b.releaseLine !== MVP_LINE && !DONE.test(b.status))
          .map((b) => {
            const where = b.releaseLine ?? 'no release line';
            return {
              disc: `${s.key}:${b.key}`,
              category: 'CONFLICT' as const,
              severity: 'critical' as const,
              dimension: 'delivery' as const,
              title: `${s.key} (R1) is blocked by ${b.key} (${where})`,
              explanation: `${s.key} "${s.title}" is in the MVP, but it cannot ship before ${b.key} "${b.title}", which is ${b.releaseLine ? `planned for ${b.releaseLine}` : 'in no release line'}. The release order contradicts the dependency.`,
              evidence: [evJira(s), evJira(b)],
              question: { text: `How should ${s.key} ship before ${b.key}?`, options: [`Move ${b.key} into R1`, `Move ${s.key} out of R1`, 'Remove the dependency'], topic: 'release plan' },
            };
          }),
      ),
  },
  {
    id: 'REL-006',
    name: 'Feature flag on planned stories',
    description: 'A story in a release line is behind a feature flag when the policy requires it (user-facing stories by default).',
    appliesTo: ['epic', 'feature'],
    run: (c) => {
      const { requireFlag } = releaseOf(c.env.policy);
      if (requireFlag === 'off') return [];
      const missing = planOf(c).stories.filter((s) => s.releaseLine && needsFlag(s, requireFlag) && !s.flagKeys?.length);
      if (!missing.length) return [];
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'delivery',
          title: `${plural(missing.length, 'planned story has', 'planned stories have')} no feature flag`,
          explanation: `${missing.map((s) => `${s.key} (${s.releaseLine})`).join(', ')} ${missing.length === 1 ? 'reaches' : 'reach'} users without a flag, so ${missing.length === 1 ? 'it' : 'they'} cannot be deployed before the decision to release or rolled out in stages. Link a flag with a flag: label.`,
          evidence: [evJira(c.r), ...missing.slice(0, 3).map((s) => evJira(s))],
          question: { text: 'Which feature flag will each planned story ship behind?', options: ['Product will link the flags', 'They ship without a flag'], topic: 'release plan' },
        },
      ];
    },
  },
];
