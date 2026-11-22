import { describe, expect, it } from 'vitest';
import { HUMAN_QUESTION_RULE, activeDecisions, analyzeProject, demoProject, recordDecision, type HumanQuestion } from '../src/index.js';

// R1 (docs/REFINEMENT-PLAN.md): a person adds a question to a work item before refinement. It is a finding with
// origin "human", closed like any other; it lowers readiness only once the Product Owner accepted it (owner's
// decision 2026-11-22), and its author is shown to the whole team.

const readyStory = async () => {
  const base = await analyzeProject(demoProject());
  const item = base.result.items.find((i) => i.type === 'story' && i.readiness === 'ready');
  if (!item) throw new Error('the demo has no ready story');
  return item.key;
};

const question = (itemKey: string, over: Partial<HumanQuestion> = {}): HumanQuestion => ({
  id: 'hq-1',
  itemKey,
  text: 'What if the card  expires\nduring the retry?',
  author: 'Ola',
  askedAt: '2026-11-22T09:00:00Z',
  accepted: false,
  ...over,
});

const run = async (questions: HumanQuestion[], decisions = [] as ReturnType<typeof activeDecisions>) => {
  const r = await analyzeProject(demoProject(), {
    humanQuestions: questions,
    decisions,
  });
  return (key: string) => r.result.items.find((i) => i.key === key)!;
};

describe('questions people ask (R1)', () => {
  it('HQ-01: a question is a finding with origin human, its author and the original text', async () => {
    const key = await readyStory();
    const item = (await run([question(key, { link: 'https://wiki.example.com/x' })]))(key);
    const f = item.findings.find((x) => x.ruleId === HUMAN_QUESTION_RULE)!;
    expect(f).toMatchObject({
      origin: 'human',
      status: 'open',
      itemKey: key,
      id: `${HUMAN_QUESTION_RULE}:${key}:hq-1`,
    });
    expect(f.human).toEqual({
      author: 'Ola',
      askedAt: '2026-11-22T09:00:00Z',
      accepted: false,
      link: 'https://wiki.example.com/x',
    });
    expect(f.question?.text).toBe('What if the card  expires\nduring the retry?');
    expect(f.title).toBe('What if the card expires during the retry?');
    expect(f.evidence[0]?.url).toBe('https://wiki.example.com/x');
  });

  it('HQ-02: until the Product Owner accepts it, the question does not change readiness', async () => {
    const key = await readyStory();
    const item = (await run([question(key)]))(key);
    expect(item.readiness).toBe('ready');
    expect(item.findings.find((x) => x.ruleId === HUMAN_QUESTION_RULE)?.blocks).toBeUndefined();
  });

  it('HQ-03: once accepted it counts like a warning (needs attention under the default policy)', async () => {
    const key = await readyStory();
    const item = (
      await run([
        question(key, {
          accepted: true,
          acceptedBy: 'PO',
          acceptedAt: '2026-11-22T10:00:00Z',
        }),
      ])
    )(key);
    expect(item.readiness).toBe('needs_attention');
    expect(item.findings.find((x) => x.ruleId === HUMAN_QUESTION_RULE)?.human?.acceptedBy).toBe('PO');
  });

  it('HQ-04: a decision on its question closes it, and readiness comes back', async () => {
    const key = await readyStory();
    const q = question(key, { accepted: true, acceptedBy: 'PO' });
    const { all } = recordDecision([], {
      questionId: `q:${HUMAN_QUESTION_RULE}:${key}:hq-1`,
      findingId: `${HUMAN_QUESTION_RULE}:${key}:hq-1`,
      itemKey: key,
      topic: 'refinement',
      question: q.text,
      answer: 'The retry stops and the user is asked for a new card.',
      decidedBy: 'PO',
      decidedAt: '2026-11-22T11:00:00Z',
      effect: 'resolve',
    });
    const item = (await run([q], activeDecisions(all)))(key);
    expect(item.findings.find((x) => x.ruleId === HUMAN_QUESTION_RULE)?.status).toBe('resolved');
    expect(item.readiness).toBe('ready');
  });

  it('HQ-05: a question on an item that is not in the analysis is ignored', async () => {
    const item = await run([question('NOPE-1')]);
    expect(item('NOPE-1')).toBeUndefined();
  });
});
