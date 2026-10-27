import type { Claim, Dimension, Evidence, FindingCategory, IssueType, Severity } from '../model.js';
import { ATTRIBUTE_LABELS, findConflicts, formatClaimValue } from './claims.js';
import { evDoc, evFrame, evJira, type ItemCtx } from './context.js';
import { requiredStates, statesIn, designStates } from './states.js';
import { OUTDATED_PATTERNS, STATE_LABELS, STATE_PATTERNS, VAGUE_TERMS } from './vocabulary.js';
import { tokenize } from '../text.js';
import { docId } from '../graph.js';
import { workItemsUnder } from '../hierarchy.js';
import { STORY_SHAPE_RULES } from './story-shape.js';
import { RELEASE_RULES } from './release-plan.js';
import { TEST_RULES } from './test-trace.js';

/**
 * Deterministic rules — the "linter" half of Hybrid Intelligence.
 * Each rule is explainable: it states why it fired and cites evidence.
 * When information is missing, rules ask a question instead of assuming.
 */

export interface FindingDraft {
  disc?: string;
  category: FindingCategory;
  severity: Severity;
  dimension: Dimension;
  title: string;
  explanation: string;
  evidence: Evidence[];
  question?: { text: string; options: string[]; topic: string };
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  appliesTo: IssueType[];
  run(c: ItemCtx): FindingDraft[];
}


const has = (re: RegExp, ...texts: string[]) => texts.some((t) => re.test(t));
const subjectOf = (c: ItemCtx) => (c.traits.has('payment') ? 'payment' : c.r.title.toLowerCase().replace(/^(user can |allow users? to )/, ''));

const firstMatching = (c: ItemCtx, re: RegExp): Evidence[] => {
  const out: Evidence[] = [];
  for (const d of c.docs) if (re.test(d.body)) out.push(evDoc(d, re));
  return out.slice(0, 2);
};

export const RULES: Rule[] = [
  // ------------------------------------------------------------------ requirements
  {
    id: 'REQ-001',
    name: 'Acceptance criteria present',
    description: 'Every story must have acceptance criteria.',
    appliesTo: ['story'],
    run: (c) =>
      c.r.acceptanceCriteria.length
        ? []
        : [
            {
              category: 'GAP',
              severity: 'critical',
              dimension: 'requirements',
              title: 'No acceptance criteria',
              explanation: 'The story has no acceptance criteria, so nobody can verify when it is done. Readiness cannot be assessed against an undefined target.',
              evidence: [evJira(c.r)],
              question: { text: `What are the acceptance criteria for "${c.r.title}"?`, options: ['Product will add acceptance criteria in Jira', 'This is a spike — no acceptance criteria needed'], topic: 'scope' },
            },
          ],
  },
  {
    id: 'REQ-002',
    name: 'User story / goal statement',
    description: 'A story should state who needs what and why.',
    appliesTo: ['story'],
    run: (c) =>
      /\bas an?\b.+\b(i want|i need|i can)\b/i.test(c.r.description) || /\bso that\b|\bin order to\b|\bgoal\b/i.test(c.r.description)
        ? []
        : [
            {
              category: 'GAP',
              severity: 'info',
              dimension: 'requirements',
              title: 'Missing user story / goal statement',
              explanation: 'The description does not say who the feature is for or what outcome it should achieve ("As a … I want … so that …").',
              evidence: [evJira(c.r)],
            },
          ],
  },
  {
    id: 'REQ-003',
    name: 'Untestable wording',
    description: 'Acceptance criteria must be measurable — vague wording is flagged as ambiguity.',
    appliesTo: ['story', 'bug'],
    run: (c) => {
      const out: FindingDraft[] = [];
      c.r.acceptanceCriteria.forEach((ac, i) => {
        for (const v of VAGUE_TERMS) {
          const m = v.pattern.exec(ac);
          if (!m) continue;
          out.push({
            disc: `ac${i}`,
            category: 'AMBIGUITY',
            severity: 'warning',
            dimension: 'requirements',
            title: `Ambiguous criterion: "${m[0]}"`,
            explanation: `"${ac}" uses "${m[0]}", which cannot be verified — ${v.hint}.`,
            evidence: [evJira(c.r, new RegExp(escapeRe(ac.slice(0, 40)), 'i'))],
            question: { text: `What exactly does "${m[0]}" mean in: "${ac}"?`, options: ['Define a measurable value (add in note)', 'Remove the wording from the criterion'], topic: 'acceptance criteria' },
          });
          break;
        }
      });
      return out.slice(0, 4);
    },
  },
  {
    id: 'REQ-004',
    name: 'Retry limit defined',
    description: 'If a feature allows retry, the number of attempts must be defined.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.traits.has('retry')) return [];
      const known = c.claims.sources.some((x) => x.attribute === 'retry_limit');
      if (known) return [];
      return [
        {
          category: 'AMBIGUITY',
          severity: 'warning',
          dimension: 'requirements',
          title: 'Retry limit not defined',
          explanation: '"The user can retry" does not say how many times, after which errors, or with what effect. No source in the context defines a retry limit.',
          evidence: [evJira(c.r, STATE_PATTERNS.retry)],
          question: { text: 'How many times can the user retry?', options: ['Once', 'Up to 3 times', 'Unlimited'], topic: 'retry behavior' },
        },
      ];
    },
  },

  // ------------------------------------------------------------------ error handling
  {
    id: 'ERR-001',
    name: 'Retry failure behaviour',
    description: 'If retry is possible, the outcome of a failed retry must be defined.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.traits.has('retry')) return [];
      const re = /retr\w* (?:also |again )?fails|retry (?:is )?unsuccessful|after (?:the )?(?:last|final|max\w*|third|3rd) (?:attempt|retry)|retries are exhausted|(?:retry )?limit (?:is )?reached|no (?:more )?retries left/i;
      if (has(re, c.specText, c.docText)) return [];
      return [
        {
          category: 'GAP',
          severity: c.traits.has('payment') ? 'critical' : 'warning',
          dimension: 'errorHandling',
          title: 'Retry failure behavior undefined',
          explanation: 'The specification allows retrying, but nothing defines what happens when the retry fails as well — what the user sees, whether they can try again, or whether the operation is cancelled.',
          evidence: [evJira(c.r, STATE_PATTERNS.retry), ...firstMatching(c, STATE_PATTERNS.retry)],
          question: { text: 'What should happen if retry fails?', options: ['Show failure state with support contact', 'Offer a different payment method', 'Allow another retry later'], topic: 'retry behavior' },
        },
      ];
    },
  },
  {
    id: 'ERR-002',
    name: 'Server error behaviour',
    description: 'Every network operation must define what the user sees on a server error.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.ui || !c.traits.has('network') || has(STATE_PATTERNS.server_error, c.specText)) return [];
      const critical = c.traits.has('payment') || c.traits.has('destructive');
      return [
        {
          category: 'GAP',
          severity: critical ? 'critical' : 'warning',
          dimension: 'errorHandling',
          title: 'Server error behavior undefined',
          explanation: 'The story describes the happy path of a server operation but not what happens when the backend fails (HTTP 5xx).',
          evidence: [evJira(c.r)],
          question: { text: 'What should the user see if the server returns an error (HTTP 5xx)?', options: ['Generic error with retry option', 'Specific message per error code', 'Return to the previous screen'], topic: 'error handling' },
        },
      ];
    },
  },
  {
    id: 'ERR-003',
    name: 'Timeout behaviour',
    description: 'Long-running, payment or async operations must define timeout behaviour.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.traits.has('network') || !(c.traits.has('payment') || c.traits.has('async') || c.traits.has('time_bound'))) return [];
      if (has(STATE_PATTERNS.timeout, c.specText)) return [];
      const docTimeout = c.claims.docs.find((x) => x.attribute === 'timeout');
      const secs = docTimeout ? `${docTimeout.value} seconds` : 'the expected time';
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'errorHandling',
          title: 'Timeout behavior undefined',
          explanation: docTimeout
            ? `"${docTimeout.evidence.title}" defines a ${formatClaimValue(docTimeout)} timeout, but the story does not say what the user experiences when it is hit.`
            : 'The operation depends on a remote system, but nothing defines what happens if it does not respond.',
          evidence: [evJira(c.r), ...(docTimeout ? [docTimeout.evidence] : [])],
          question: {
            text: `What should happen if the ${subjectOf(c)} API does not respond within ${secs}?`,
            options: ['Show retry option', 'Show failure state', 'Continue polling', 'Cancel the operation'],
            topic: 'timeout behavior',
          },
        },
      ];
    },
  },
  {
    id: 'ERR-004',
    name: 'Destructive action confirmation',
    description: 'Destructive actions must define confirmation and error behaviour.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.ui || !c.traits.has('destructive') || has(STATE_PATTERNS.confirmation, c.specText)) return [];
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'errorHandling',
          title: 'No confirmation / undo for destructive action',
          explanation: 'The story removes or cancels something but does not define whether the user must confirm it or can undo it.',
          evidence: [evJira(c.r)],
          question: { text: 'Should the user confirm this action, and can it be undone?', options: ['Confirmation dialog', 'Undo snackbar (no dialog)', 'No confirmation needed'], topic: 'destructive actions' },
        },
      ];
    },
  },
  {
    id: 'ERR-005',
    name: 'Session expiry',
    description: 'Authenticated multi-step flows should define behaviour on session expiry.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.ui || !c.traits.has('authenticated') || !(c.traits.has('payment') || c.traits.has('form'))) return [];
      if (has(STATE_PATTERNS.session_expired, c.specText, c.docText)) return [];
      return [
        {
          category: 'GAP',
          severity: 'info',
          dimension: 'errorHandling',
          title: 'Session expiry behavior undefined',
          explanation: 'The flow runs in an authenticated context, but nothing defines what happens if the session expires mid-flow.',
          evidence: [evJira(c.r)],
          question: { text: 'What happens if the session expires during this flow?', options: ['Redirect to login and resume the flow', 'Redirect to login, progress is lost', 'Not applicable'], topic: 'session expiry' },
        },
      ];
    },
  },

  // ------------------------------------------------------------------ architecture
  {
    id: 'ARCH-001',
    name: 'Idempotency strategy for payment retry',
    description: 'A retryable payment operation must have an idempotency strategy.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.traits.has('payment') || !(c.traits.has('retry') || c.traits.has('concurrent'))) return [];
      if (c.claims.sources.some((x) => x.attribute === 'idempotent' && x.value === true)) return [];
      const repeated = c.claims.docs.filter((x) => x.attribute === 'idempotent' && x.value === false);
      return [
        {
          category: 'GAP',
          severity: 'critical',
          dimension: 'architecture',
          title: 'Idempotency strategy missing',
          explanation: repeated[0]
            ? `Retry may create a duplicate payment: "${repeated[0].evidence.title}" states that repeated requests are accepted, and no idempotency mechanism is defined in the requirements or decisions.`
            : 'Retry may create a duplicate payment: the feature allows repeating a payment request and no idempotency mechanism was identified in Jira, Confluence or recorded decisions.',
          evidence: [evJira(c.r, STATE_PATTERNS.retry), ...repeated.map((x) => x.evidence), ...firstMatching(c, /payment|retry/i)].slice(0, 4),
          question: {
            text: 'How do we prevent duplicate charges when a payment request is retried?',
            options: ['Idempotency key per payment attempt', 'Server-side de-duplication window', 'Disable retry until final status is known'],
            topic: 'idempotency',
          },
        },
      ];
    },
  },
  {
    id: 'ARCH-002',
    name: 'Async processing state',
    description: 'If the underlying API is asynchronous, the UX must define a processing state.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.ui || !c.traits.has('async') || has(STATE_PATTERNS.processing, c.specText)) return [];
      const asyncClaims = c.claims.docs.filter((x) => x.attribute === 'processing_mode' && x.value === 'async');
      return [
        {
          category: 'GAP',
          severity: 'warning',
          dimension: 'architecture',
          title: 'Processing state not defined for async API',
          explanation: `The API is asynchronous${asyncClaims[0] ? ` (per "${asyncClaims[0].evidence.title}")` : ''}, but the requirements do not define what the user sees while the operation is processing.`,
          evidence: [evJira(c.r), ...asyncClaims.slice(0, 2).map((x) => x.evidence)],
          question: { text: 'What does the user see while the operation is processing?', options: ['Processing screen with status polling', 'Optimistic success + notification later', 'Block until final result'], topic: 'async behavior' },
        },
      ];
    },
  },
  {
    id: 'ARCH-003',
    name: 'Sync expectation vs async architecture',
    description: 'Requirements expecting an immediate result conflict with an asynchronous API.',
    appliesTo: ['story'],
    run: (c) => {
      const wantsSync = c.claims.spec.filter((x) => x.attribute === 'processing_mode' && x.value === 'sync');
      const isAsync = c.claims.docs.filter((x) => x.attribute === 'processing_mode' && x.value === 'async');
      const [want] = wantsSync;
      const [doc] = isAsync;
      if (!want || !doc) return [];
      return [
        {
          category: 'CONFLICT',
          severity: 'critical',
          dimension: 'architecture',
          title: 'Requirement expects immediate result, API is asynchronous',
          explanation: `The story expects an immediate final result ("${want.text}"), but "${doc.evidence.title}" describes asynchronous processing.`,
          evidence: [want.evidence, ...isAsync.slice(0, 2).map((x) => x.evidence)],
          question: { text: 'Should the UI wait for the final result, poll for status, or display a processing state?', options: ['Wait for final result (make API synchronous)', 'Poll for status', 'Display processing state and notify later'], topic: 'async behavior' },
        },
      ];
    },
  },

  // ------------------------------------------------------------------ design
  {
    id: 'DES-001',
    name: 'Design linked',
    description: 'User-facing stories must have a design.',
    appliesTo: ['story'],
    run: (c) =>
      !c.ui || c.frames.length
        ? []
        : [
            {
              category: 'GAP',
              severity: 'warning',
              dimension: 'design',
              title: 'No Figma design found',
              explanation: 'No Figma frame is linked to this story and none could be discovered semantically with sufficient confidence.',
              evidence: [evJira(c.r)],
              question: { text: `Which Figma frames define "${c.r.title}"?`, options: ['Link an existing frame (add in note)', 'Design is still needed', 'No UI change in this story'], topic: 'design coverage' },
            },
          ],
  },
  {
    id: 'DES-002',
    name: 'Required UI states present in design',
    description: 'Every UI state required by the requirements or implied by the feature must exist in Figma.',
    appliesTo: ['story'],
    run: (c) => {
      if (!c.ui || !c.frames.length) return [];
      const inDesign = new Set(designStates(c.frames));
      const inReq = new Set(statesIn(c.specText));
      const out: FindingDraft[] = [];
      for (const { state, because } of requiredStates(c)) {
        if (inDesign.has(state)) continue;
        const explicit = inReq.has(state);
        if (!explicit && (state === 'idle' || state === 'session_expired' || state === 'network_failure')) continue;
        const critical = explicit && c.traits.has('payment') && (state === 'processing' || state === 'retry' || state === 'loading');
        const label = STATE_LABELS[state].toLowerCase();
        out.push({
          disc: state,
          category: 'MISSING_COVERAGE',
          severity: critical ? 'critical' : explicit ? 'warning' : 'info',
          dimension: 'design',
          title: `Figma missing ${label} state`,
          explanation: explicit
            ? `The requirements describe a ${label} state, but none of the ${c.frames.length} linked Figma frames shows it.`
            : `A ${label} state is implied (${because}), but it is neither designed in Figma nor described in the requirements.`,
          evidence: [...(explicit ? [evJira(c.r, STATE_PATTERNS[state])] : []), ...c.frames.slice(0, 3).map(evFrame)],
          question: {
            text: `Figma has no ${label} state for "${c.r.title}". What should it look like?`,
            options: ['Design will add the state', 'Reuse an existing pattern (add in note)', 'State not needed — update requirements'],
            topic: 'ui states',
          },
        });
      }
      return out;
    },
  },

  // ------------------------------------------------------------------ documentation
  {
    id: 'DOC-001',
    name: 'Documentation found',
    description: 'Features touching payments or async APIs should have documentation.',
    appliesTo: ['story'],
    run: (c) =>
      c.docs.length
        ? []
        : [
            {
              category: 'GAP',
              severity: c.traits.has('payment') || c.traits.has('async') ? 'warning' : 'info',
              dimension: 'documentation',
              title: 'No related documentation found',
              explanation: 'No Confluence page is linked to this item and none could be discovered with sufficient confidence.',
              evidence: [evJira(c.r)],
            },
          ],
  },
  {
    id: 'DOC-002',
    name: 'Outdated documentation',
    description: 'Documentation marked as deprecated / superseded, or superseded in the graph.',
    appliesTo: ['story', 'epic', 'feature', 'bug'],
    run: (c) => {
      const out: FindingDraft[] = [];
      for (const d of c.docs) {
        const label = d.labels.find((l) => /deprecated|archived|obsolete|outdated/i.test(l));
        const superseded = c.env.built.graph.in(docId(d)).find((r) => r.type === 'supersedes');
        if (!label && !OUTDATED_PATTERNS.test(d.body) && !superseded) continue;
        const by = superseded ? c.env.built.graph.entities.get(superseded.from)?.title : undefined;
        out.push({
          disc: d.id,
          category: 'OUTDATED',
          severity: 'warning',
          dimension: 'documentation',
          title: `Possibly outdated: ${d.title}`,
          explanation: by ? `"${d.title}" is superseded by "${by}" but is still part of this item's context.` : `"${d.title}" is marked as ${label ?? 'deprecated / superseded'} but is still used as context for this item.`,
          evidence: [evDoc(d, OUTDATED_PATTERNS)],
          question: { text: `Is "${d.title}" still valid for this feature?`, options: ['Still valid', 'Outdated — will be updated', 'Outdated — remove from context'], topic: 'documentation' },
        });
      }
      return out;
    },
  },
  {
    id: 'CON-001',
    name: 'Cross-source conflicts',
    description: 'Two sources state different values for the same fact (timeout, retry limit, idempotency, …), including the code as tf reconstructed it.',
    appliesTo: ['story', 'epic', 'feature', 'bug'],
    run: (c) => {
      const out: FindingDraft[] = [];
      for (const conflict of findConflicts([...c.claims.all, ...c.claims.code])) {
        const decided = conflict.claims.filter((x) => x.evidence.source === 'decision');
        // A human decision settles the question — only sources disagreeing with it remain a problem.
        const latestDecision = decided.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0];
        const disagreeing = latestDecision ? conflict.claims.filter((x) => x.evidence.source !== 'decision' && formatClaimValue(x) !== formatClaimValue(latestDecision)) : conflict.claims;
        if (latestDecision && !disagreeing.length) continue;
        const sources = new Set(conflict.claims.map((x) => x.evidence.source));
        const attr = ATTRIBUTE_LABELS[conflict.attribute];
        const architectural = conflict.attribute === 'idempotent' || conflict.attribute === 'processing_mode' || conflict.attribute === 'ocpp_version';
        const critical = !!latestDecision || architectural || sources.has('jira');
        const byValue = groupClaims(conflict.claims);
        out.push({
          disc: `${conflict.subject}.${conflict.attribute}`,
          category: 'CONFLICT',
          severity: critical ? 'critical' : 'warning',
          dimension: architectural ? 'architecture' : 'documentation',
          title: latestDecision ? `Sources contradict decision on ${conflict.subject} ${attr}` : `Conflicting ${conflict.subject} ${attr}: ${conflict.values.join(' vs ')}`,
          explanation: latestDecision
            ? `A decision set ${conflict.subject} ${attr} to ${formatClaimValue(latestDecision)}, but ${disagreeing.map((x) => `"${x.evidence.title}" says ${formatClaimValue(x)}`).join('; ')}.`
            : `${sources.size} source${sources.size > 1 ? 's' : ''} describe different ${attr} behavior: ${[...byValue].map(([v, cs]) => `${v} (${cs.map((x) => x.evidence.title).join(', ')})`).join(' vs ')}.`,
          evidence: conflict.claims.map((x) => x.evidence).slice(0, 5),
          question: latestDecision
            ? {
                text: `${disagreeing.map((x) => `"${x.evidence.title}"`).join(', ')} contradict${disagreeing.length === 1 ? 's' : ''} the decision (${formatClaimValue(latestDecision)}). What happens next?`,
                options: ['Sources will be updated to match the decision', 'Decision must be revisited'],
                topic: 'documentation',
              }
            : { text: `Which ${attr} is correct for ${conflict.subject}?`, options: [...byValue].map(([v, cs]) => `${v} (as in ${cs[0]!.evidence.title})`), topic: `${conflict.subject} ${attr}` },
        });
      }
      return out;
    },
  },

  // ------------------------------------------------------------------ coverage
  {
    id: 'COV-001',
    name: 'Story ↔ tasks coverage',
    description: 'Every acceptance criterion must be covered by at least one implementation task.',
    appliesTo: ['story'],
    run: (c) => {
      const tasks = (c.env.childrenOf.get(c.r.key) ?? []).filter((t) => t.type === 'task' || t.type === 'subtask');
      if (!tasks.length) return [];
      const cov = taskCoverage(c.r.acceptanceCriteria, tasks.map((t) => ({ key: t.key, text: `${t.title} ${t.description}` })));
      return cov.requirements
        .map((x, i) => ({ ...x, i }))
        .filter((x) => !x.coveredBy.length)
        .map((x) => ({
          disc: `ac${x.i}`,
          category: 'MISSING_COVERAGE' as const,
          severity: 'warning' as const,
          dimension: 'dependencies' as const,
          title: 'Requirement has no implementation task',
          explanation: `"${x.criterion}" is not covered by any of the ${tasks.length} tasks (${tasks.map((t) => t.key).join(', ')}).`,
          evidence: [evJira(c.r, new RegExp(escapeRe(x.criterion.slice(0, 40)), 'i')), ...tasks.slice(0, 3).map((t) => evJira(t))],
          question: { text: `"${x.criterion}" has no implementation task. How is it covered?`, options: ['Create a task', 'Covered by an existing task (add in note)', 'Out of scope for this story'], topic: 'task coverage' },
        }));
    },
  },

  // ------------------------------------------------------------------ bugs
  {
    id: 'BUG-001',
    name: 'Bug report completeness',
    description: 'A bug needs reproduction steps, expected and actual behaviour, and environment.',
    appliesTo: ['bug'],
    run: (c) => {
      const b = c.r.bug ?? {};
      const missing = [
        ['reproduction steps', b.stepsToReproduce],
        ['expected behavior', b.expected],
        ['actual behavior', b.actual],
        ['environment', b.environment],
      ]
        .filter(([, v]) => !v)
        .map(([k]) => k as string);
      if (!missing.length) return [];
      return [
        {
          category: 'GAP',
          severity: missing.includes('reproduction steps') ? 'warning' : 'info',
          dimension: 'requirements',
          title: `Bug report incomplete: ${missing.join(', ')}`,
          explanation: `The bug report is missing ${missing.join(', ')}, which makes it hard to reproduce and to verify the fix.`,
          evidence: [evJira(c.r)],
        },
      ];
    },
  },
  {
    id: 'BUG-002',
    name: 'Bug linked to a story',
    description: 'A bug should be traceable to the story / requirement it violates.',
    appliesTo: ['bug'],
    run: (c) => {
      const linked = c.r.links.some((l) => c.env.reqByKey.get(l.key)?.type === 'story') || (c.r.parentKey && c.env.reqByKey.get(c.r.parentKey)?.type === 'story');
      return linked
        ? []
        : [
            {
              category: 'GAP',
              severity: 'info',
              dimension: 'dependencies',
              title: 'Bug not linked to a story',
              explanation: 'The bug is not linked to the story whose requirement it violates, so its root cause cannot be traced to a specification gap.',
              evidence: [evJira(c.r)],
              question: { text: 'Which story does this bug relate to?', options: ['Link the related story (add key in note)', 'No related story — standalone defect'], topic: 'traceability' },
            },
          ];
    },
  },
  {
    id: 'BUG-003',
    name: 'Regression test defined',
    description: 'A bug fix should define the regression test that prevents it from coming back.',
    appliesTo: ['bug'],
    run: (c) =>
      /regression test|test case|automated test|covered by test/i.test(c.specText)
        ? []
        : [
            {
              category: 'GAP',
              severity: 'warning',
              dimension: 'errorHandling',
              title: 'Missing regression test definition',
              explanation: 'The bug does not define a regression test scenario; the same failure can return unnoticed.',
              evidence: [evJira(c.r)],
              question: { text: 'Which regression scenario must be tested for this bug?', options: ['Add regression scenario to acceptance criteria', 'Covered by existing test suite (add in note)'], topic: 'testing' },
            },
          ],
  },

  // ------------------------------------------------------------------ epics
  {
    id: 'EPIC-001',
    name: 'Epic business goal',
    description: 'An epic or feature must state its business goal and expected outcome.',
    appliesTo: ['epic', 'feature'],
    run: (c) =>
      /\b(goal|objective|outcome|so that|in order to|success metric|kpi|we expect)\b/i.test(c.r.description)
        ? []
        : [
            {
              category: 'GAP',
              severity: 'warning',
              dimension: 'requirements',
              title: `${c.r.type === 'feature' ? 'Feature' : 'Epic'} has no business goal / expected outcome`,
              explanation: 'The epic description does not state the business goal or how success will be measured, so story scope cannot be checked against it.',
              evidence: [evJira(c.r)],
              question: { text: `What is the business goal and expected outcome of "${c.r.title}"?`, options: ['Product will add goal & success metric'], topic: 'scope' },
            },
          ],
  },
  {
    id: 'EPIC-002',
    name: 'Epic has stories',
    description: 'An epic or feature without stories (directly or through features) has no defined scope.',
    appliesTo: ['epic', 'feature'],
    run: (c) =>
      workItemsUnder(c.env.childrenOf, c.r.key).length
        ? []
        : [
            {
              category: 'MISSING_COVERAGE',
              severity: 'warning',
              dimension: 'requirements',
              title: `${c.r.type === 'feature' ? 'Feature' : 'Epic'} has no stories`,
              explanation: `No stories belong to this ${c.r.type}, so its scope is not broken down into deliverable requirements.`,
              evidence: [evJira(c.r)],
            },
          ],
  },
  // ------------------------------------------------------------------ story shape (STORY-001…003, AC-001…004)
  ...STORY_SHAPE_RULES,
  // ------------------------------------------------------------------ release plan (REL-001…006)
  ...RELEASE_RULES,
  ...TEST_RULES,
];

function groupClaims(cs: Claim[]): Map<string, Claim[]> {
  const m = new Map<string, Claim[]>();
  for (const c of cs) {
    const v = formatClaimValue(c);
    (m.get(v) ?? m.set(v, []).get(v)!).push(c);
  }
  return m;
}

export function taskCoverage(criteria: string[], tasks: { key: string; text: string }[]) {
  const taskTokens = tasks.map((t) => ({ key: t.key, tokens: new Set(tokenize(t.text)) }));
  const requirements = criteria.map((criterion) => {
    const ct = new Set(tokenize(criterion));
    const coveredBy = taskTokens
      .filter((t) => {
        let shared = 0;
        for (const x of ct) if (t.tokens.has(x)) shared++;
        return ct.size > 0 && shared / ct.size >= 0.5;
      })
      .map((t) => t.key);
    return { criterion, coveredBy };
  });
  const covered = requirements.filter((r) => r.coveredBy.length).length;
  return { requirements, percent: criteria.length ? Math.round((covered / criteria.length) * 100) : 100 };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
