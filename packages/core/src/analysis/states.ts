import type { Challenge, DesignFrame, Journey, JourneyCoverage, SourceSystem, StateCoverage, UiState } from '../model.js';
import { evDecision, evDoc, evJira, questionOptions, type ItemCtx } from './context.js';
import { DESIGN_STATE_PATTERNS, JOURNEY_PATTERNS, STATE_PATTERNS } from './vocabulary.js';

/**
 * State-machine view of a feature: which UI states must exist (derived from
 * requirements + feature traits), which are described in requirements, and
 * which are present in Figma.
 */

export function statesIn(text: string): UiState[] {
  return (Object.keys(STATE_PATTERNS) as UiState[]).filter((s) => STATE_PATTERNS[s].test(text));
}

export function designStates(frames: DesignFrame[]): UiState[] {
  const out = new Set<UiState>();
  for (const f of frames) {
    const labels = [f.name, ...f.texts];
    for (const s of Object.keys(DESIGN_STATE_PATTERNS) as UiState[]) {
      // Frame names are authoritative; text layers only count for short labels (variants / headings).
      if (DESIGN_STATE_PATTERNS[s].test(f.name) || labels.some((t) => t.length <= 40 && DESIGN_STATE_PATTERNS[s].test(t))) out.add(s);
    }
  }
  // A frame with only a form and submit button still represents "idle".
  if (frames.length) out.add('idle');
  return [...out];
}

export function requiredStates(c: ItemCtx): { state: UiState; because: string }[] {
  const req: { state: UiState; because: string }[] = [];
  const add = (state: UiState, because: string) => {
    if (!req.some((x) => x.state === state)) req.push({ state, because });
  };
  const t = c.traits;
  add('idle', 'entry state of every flow');
  add('success', 'every flow needs a defined outcome');
  if (t.has('network')) {
    add('loading', 'the operation calls a server');
    add('server_error', 'the operation calls a server');
  }
  if (t.has('async')) add('processing', 'the API processes asynchronously');
  if (t.has('form')) add('validation_error', 'the user enters data');
  if (t.has('retry')) add('retry', 'the feature allows retry');
  if (t.has('network') && (t.has('payment') || t.has('async') || t.has('time_bound'))) add('timeout', 'remote operation may not respond');
  if (t.has('destructive')) add('confirmation', 'the action is destructive');
  if (t.has('list')) add('empty', 'the feature shows a collection');
  if (t.has('authenticated') && t.has('payment')) add('session_expired', 'authenticated payment flow');
  // Anything explicitly described in the requirements is required as well.
  for (const s of statesIn(c.specText)) add(s, 'described in the requirements');
  return req;
}

export function stateCoverage(c: ItemCtx): StateCoverage {
  const required = requiredStates(c);
  const inRequirements = statesIn(c.specText);
  const inDesign = c.frames.length ? designStates(c.frames) : [];
  return {
    required,
    inRequirements,
    inDesign,
    missingInDesign: required.map((x) => x.state).filter((s) => !inDesign.includes(s)),
    missingInRequirements: required.map((x) => x.state).filter((s) => s !== 'idle' && !inRequirements.includes(s)),
  };
}

export function expectedJourneys(c: ItemCtx): Journey[] {
  const t = c.traits;
  const j: Journey[] = ['happy_path'];
  if (t.has('form')) j.push('validation_error');
  if (t.has('network')) j.push('server_error');
  if (t.has('network') && (t.has('payment') || t.has('async') || t.has('time_bound'))) j.push('timeout');
  if (t.has('retry') || t.has('payment')) j.push('retry');
  if (t.has('authenticated') && (t.has('payment') || t.has('form'))) j.push('session_expired');
  if (t.has('network') && (t.has('payment') || t.has('upload'))) j.push('network_failure');
  if (/\b(role|admin|permission|owner|only (?:the )?\w+ can)\b/i.test(c.specText)) j.push('permission_denied');
  if (t.has('list')) j.push('empty_state');
  if (t.has('payment') || t.has('async') || t.has('destructive')) j.push('cancel');
  return [...new Set(j)];
}

export function journeyCoverage(c: ItemCtx): JourneyCoverage {
  const reqText = [c.r.title, c.r.description, ...c.r.acceptanceCriteria, ...c.r.businessRules].join('\n');
  const decText = c.decisions.map((d) => `${d.answer} ${d.note ?? ''}`).join('\n');
  const journeys = expectedJourneys(c).map((journey) => {
    const re = JOURNEY_PATTERNS[journey];
    const where: SourceSystem[] = [];
    if (re.test(reqText)) where.push('jira');
    if (re.test(decText)) where.push('decision');
    if (re.test(c.docText)) where.push('confluence');
    if (c.frames.some((f) => re.test(f.name) || f.texts.some((t) => t.length <= 60 && re.test(t)))) where.push('figma');
    // Covered = defined in the specification (requirements, decisions or docs).
    const covered = where.some((w) => w !== 'figma');
    return { journey, covered, where };
  });
  const covered = journeys.filter((x) => x.covered).length;
  return { journeys, percent: Math.round((covered / journeys.length) * 100) };
}

// ---------------------------------------------------------------------------
// Adversarial review — "assume the specification is incomplete; try to break it"
// ---------------------------------------------------------------------------

interface Probe {
  id: string;
  when: (c: ItemCtx) => boolean;
  text: (c: ItemCtx) => string;
  rationale: string;
  answeredBy: RegExp | ((c: ItemCtx) => boolean);
  options: string[];
  topic: string;
}

const PROBES: Probe[] = [
  {
    id: 'response-lost',
    when: (c) => c.traits.has('network') && (c.traits.has('payment') || c.traits.has('retry')),
    text: () => 'What happens if the first attempt actually succeeds, but the response never reaches the client?',
    rationale: 'Lost responses are the classic source of duplicate operations and "ghost" failures.',
    answeredBy: /response (?:is )?lost|never (?:arrives|reaches)|does not arrive|unknown (?:status|outcome)|reconcil|status (?:check|endpoint)|idempoten/i,
    options: ['Check operation status before allowing retry', 'Rely on idempotency key', 'Show "status unknown" and reconcile later'],
    topic: 'idempotency',
  },
  {
    id: 'double-action',
    when: (c) => c.traits.has('network') && (c.traits.has('payment') || c.traits.has('destructive') || c.traits.has('form')),
    text: () => 'What happens if the user performs the action twice (double click, two tabs, two devices)?',
    rationale: 'Double submission can duplicate payments or records.',
    answeredBy: /twice|double|disabled while|disabled during|prevent(?:s|ing)? duplicate|idempoten|only once/i,
    options: ['Button disabled while in progress', 'Server rejects duplicates (idempotency)', 'Both'],
    topic: 'duplicate request behavior',
  },
  {
    id: 'retry-duplicate',
    when: (c) => c.traits.has('retry'),
    text: () => 'Can retry create a duplicate operation?',
    rationale: 'Retrying a non-idempotent operation repeats its side effects.',
    answeredBy: (c) => c.claims.all.some((x) => x.attribute === 'idempotent' && x.value === true) || /duplicate/i.test(c.specText),
    options: ['No — operation is idempotent', 'Yes — acceptable', 'Unknown — needs architecture input'],
    topic: 'idempotency',
  },
  {
    id: 'http-500',
    when: (c) => c.traits.has('network'),
    text: () => 'What happens if the server returns HTTP 500?',
    rationale: 'Server errors are certain to happen in production.',
    answeredBy: STATE_PATTERNS.server_error,
    options: ['Generic error with retry', 'Specific error message', 'Silent retry in background'],
    topic: 'error handling',
  },
  {
    id: 'timeout',
    when: (c) => c.traits.has('network') && (c.traits.has('payment') || c.traits.has('async') || c.traits.has('time_bound')),
    text: () => 'What happens if the operation times out?',
    rationale: 'Remote dependencies do not always answer.',
    answeredBy: STATE_PATTERNS.timeout,
    options: ['Show retry option', 'Show failure state', 'Continue polling', 'Cancel the operation'],
    topic: 'timeout behavior',
  },
  {
    id: 'leave-page',
    when: (c) => c.ui && (c.traits.has('payment') || c.traits.has('async') || c.traits.has('upload')),
    text: () => 'Can the user leave or close the page while the operation is in progress? What happens then?',
    rationale: 'Users navigate away; in-flight operations must still end in a defined state.',
    answeredBy: JOURNEY_PATTERNS.cancel,
    options: ['Warn before leaving', 'Operation continues; result shown on return', 'Operation is cancelled'],
    topic: 'navigation',
  },
  {
    id: 'session-expiry',
    when: (c) => c.traits.has('authenticated'),
    text: () => 'What happens after session expiry in the middle of this flow?',
    rationale: 'Long flows outlive sessions.',
    answeredBy: STATE_PATTERNS.session_expired,
    options: ['Re-login and resume', 'Re-login and restart', 'Not applicable'],
    topic: 'session expiry',
  },
  {
    id: 'network-loss',
    when: (c) => c.ui && c.traits.has('network'),
    text: () => 'What happens if the network disconnects mid-operation?',
    rationale: 'Mobile and flaky networks are common.',
    answeredBy: STATE_PATTERNS.network_failure,
    options: ['Show offline state and retry when online', 'Show generic error', 'Not applicable (desktop only)'],
    topic: 'error handling',
  },
  {
    id: 'concurrent-change',
    when: (c) => c.traits.has('destructive') || c.traits.has('list') || c.traits.has('concurrent'),
    text: () => 'What happens if the resource was changed or deleted by another user or device in the meantime?',
    rationale: 'Concurrent modification leads to stale UI and confusing errors.',
    answeredBy: /another (?:user|device|session)|concurren|conflict|stale|already (?:deleted|removed)|no longer exists/i,
    options: ['Show "no longer available" and refresh', 'Last write wins', 'Not possible in this context'],
    topic: 'concurrency',
  },
  {
    id: 'retry-limit',
    when: (c) => c.traits.has('retry'),
    text: () => 'Is there a limit on retries, and what does the user see when it is reached?',
    rationale: 'Unlimited retries can hammer downstream systems or confuse users.',
    answeredBy: (c) => c.claims.all.some((x) => x.attribute === 'retry_limit') || /limit (?:is )?reached/i.test(c.specText),
    options: ['Limit of 3, then failure state', 'Unlimited', 'Limit defined by backend'],
    topic: 'retry behavior',
  },
  {
    id: 'upload-too-large',
    when: (c) => c.traits.has('upload'),
    text: () => 'What happens if the uploaded file is too large or has an unsupported type?',
    rationale: 'Upload limits always exist somewhere — the UX must know them.',
    answeredBy: (c) => c.claims.all.some((x) => x.attribute === 'max_file_size') || /too large|file type|unsupported format/i.test(c.specText),
    options: ['Validate client-side with message', 'Server rejects with message', 'Both'],
    topic: 'validation',
  },
  {
    id: 'partial-success',
    when: (c) => c.traits.has('payment') && c.traits.has('async'),
    text: () => 'What if the payment succeeds at the provider but our system fails to record it?',
    rationale: 'Async payment flows need reconciliation to avoid charged-but-not-paid orders.',
    answeredBy: /reconcil|webhook|compensat|eventual(?:ly)? consistent/i,
    options: ['Webhook reconciliation', 'Scheduled reconciliation job', 'Manual support process'],
    topic: 'consistency',
  },
  {
    id: 'empty',
    when: (c) => c.ui && c.traits.has('list'),
    text: () => 'What does the user see when there are no items?',
    rationale: 'Empty states are the most frequently forgotten screen.',
    answeredBy: STATE_PATTERNS.empty,
    options: ['Empty state with call to action', 'Hide the section', 'Not applicable'],
    topic: 'ui states',
  },
  {
    id: 'permissions',
    when: (c) => c.traits.has('destructive'),
    text: () => 'Who is allowed to perform this action? What do other roles see?',
    rationale: 'Destructive actions usually need authorization rules.',
    answeredBy: /\b(role|admin|permission|owner|only (?:the )?\w+ can|authori[sz])/i,
    options: ['Only the owner', 'Owner and admins', 'Anyone with access'],
    topic: 'permissions',
  },
];

export function challenges(c: ItemCtx): Challenge[] {
  const out: Challenge[] = [];
  for (const p of PROBES) {
    if (!p.when(c)) continue;
    const id = `ch:${c.r.key}:${p.id}`;
    const decision = c.env.decisionsByQuestion.get(id);
    let answered = !!decision;
    let answeredBy = decision ? evDecision(decision) : undefined;
    if (!answered) {
      if (typeof p.answeredBy === 'function') answered = p.answeredBy(c);
      else {
        const re = p.answeredBy;
        const reqText = [c.r.title, c.r.description, ...c.r.acceptanceCriteria, ...c.r.businessRules].join('\n');
        if (re.test(reqText)) {
          answered = true;
          answeredBy = evJira(c.r, re);
        } else {
          const d = c.docs.find((x) => re.test(x.body));
          const dec = c.decisions.find((x) => re.test(`${x.answer} ${x.note ?? ''}`));
          if (dec) [answered, answeredBy] = [true, evDecision(dec)];
          else if (d) [answered, answeredBy] = [true, evDoc(d, re)];
        }
      }
    }
    out.push({
      id,
      question: { id, text: p.text(c), options: questionOptions(p.options), topic: p.topic },
      rationale: p.rationale,
      answered,
      answeredBy,
      decision: decision?.answer,
      origin: 'rule',
    });
  }
  return out;
}
