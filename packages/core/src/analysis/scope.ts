import type { Evidence } from '../model.js';
import { evJira, type ItemCtx } from './context.js';
import type { Rule } from './rules.js';

/**
 * DV5 (docs/SCOPE-PLAN.md): a slice of a change from a repository that does what the change's intent puts out of scope
 * (`## Out of scope` / `## Poza zakresem` of intent.md, read into `repo.outOfScope`). Deterministic word overlap; a
 * warning with a question, never blocking.
 */

/** Content words: at least 4 letters, or an acronym (2+ capitals); compared by their first 6 letters. */
function stems(text: string): string[] {
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const kept = words.filter((w) => w.length >= 4 || (w.length >= 2 && w === w.toUpperCase() && /\p{Lu}/u.test(w)));
  return [...new Set(kept.map((w) => w.toLowerCase().slice(0, 6)))];
}

/**
 * Whether `text` covers an out-of-scope `item`: its only content word, or at least two of its content words and at
 * least half of them, appear in the text.
 */
export function scopeOverlap(item: string, text: string): boolean {
  const want = stems(item);
  if (!want.length) return false;
  const have = new Set(stems(text));
  const hits = want.filter((s) => have.has(s)).length;
  return want.length === 1 ? hits === 1 : hits >= 2 && hits * 2 >= want.length;
}

const evPlan = (c: ItemCtx): Evidence => {
  const r = c.r.repo!;
  return { ...evJira(c.r), title: 'Slice in plan.md', path: r.path, ...(r.line && { line: r.line }), ...(c.r.url && { url: c.r.url }) };
};

export const SCOPE_RULES: Rule[] = [
  {
    id: 'SCOPE-001',
    name: 'Slice beyond the intent',
    description: 'A slice of a change does what the change\'s intent puts out of scope (intent.md, "Out of scope").',
    appliesTo: ['story'],
    run(c) {
      const items = c.r.repo?.outOfScope ?? [];
      const text = [c.r.title, c.r.description, ...c.r.acceptanceCriteria].join(' ');
      const hit = items.filter((i) => scopeOverlap(i, text));
      if (!hit.length) return [];
      const list = hit.map((i) => `"${i}"`).join(', ');
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'requirements',
          title: `Slice looks out of scope of ${c.r.epicKey ?? 'the change'}`,
          explanation: `The intent puts ${list} out of scope, and ${c.r.key} ("${c.r.title}") seems to do it. Either the slice goes beyond the goal of the change, or the scope changed and the intent should say so.`,
          evidence: [evPlan(c)],
          question: {
            text: `${c.r.key} seems to do what the intent puts out of scope (${list}). What should happen?`,
            options: ['Remove the slice from this change', 'Update the intent: the scope changed', 'Not out of scope (say why in the note)'],
            topic: 'scope',
          },
        },
      ];
    },
  },
];
