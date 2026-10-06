import { describe, expect, it } from 'vitest';
import { adfToText, framesFromDocument, jiraIssueToRequirement, parseOutput, splitSections } from '../src/index.js';

describe('jira helpers', () => {
  it('converts ADF and splits sections', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'As a user I want X.' }] },
        { type: 'heading', content: [{ type: 'text', text: 'Acceptance Criteria' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Shows success' }] }] }] },
      ],
    };
    const text = adfToText(adf);
    const s = splitSections(text);
    expect(s.get('__body')).toBe('As a user I want X.');
    expect(s.get('acceptance criteria')).toBe('- Shows success');
  });
});

describe('figma helpers', () => {
  it('extracts top-level frames with texts and transitions', () => {
    const doc = {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [
        {
          id: '0:1',
          name: 'Payment',
          type: 'CANVAS',
          children: [
            { id: '2:3', name: 'Payment / Error', type: 'FRAME', children: [{ id: '2:9', name: 't', type: 'TEXT', characters: 'Payment failed' }], transitionNodeID: '2:4' },
            { id: '9:9', name: 'Section', type: 'SECTION', children: [{ id: '2:4', name: 'Payment / Success', type: 'FRAME' }] },
          ],
        },
      ],
    };
    const frames = framesFromDocument('KEY', 'File', '2026-01-01', doc);
    expect(frames.map((f) => f.name)).toEqual(['Payment / Error', 'Payment / Success']);
    expect(frames[0].texts).toEqual(['Payment failed']);
    expect(frames[0].transitions).toEqual(['2:4']);
    expect(frames[0].url).toContain('node-id=2-3');
  });
});

describe('untrusted API payloads', () => {
  it('ignores malformed ADF nodes', () => {
    const adf = { type: 'doc', content: [null, 'x', { type: 'text', text: 5 }, { type: 'paragraph', content: 'oops' }, { type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }] };
    expect(adfToText(adf)).toBe('ok');
    expect(adfToText(42)).toBe('');
  });

  it('maps Jira fields of the wrong type to safe defaults', () => {
    const r = jiraIssueToRequirement({ key: 'X-1', fields: { summary: 5, labels: 'a', components: [null, { name: 'Pay' }, { name: 1 }], issuelinks: [null, { outwardIssue: { key: 'X-2' } }], status: 'Done' } }, 'https://j');
    expect(r.title).toBe('X-1');
    expect(r.labels).toEqual([]);
    expect(r.components).toEqual(['Pay']);
    expect(r.links).toEqual([{ type: 'relates to', key: 'X-2' }]);
    expect(r.status).toBe('Unknown');
  });

  it('skips malformed Figma nodes', () => {
    const doc = { type: 'DOCUMENT', children: [null, { id: '0:1', name: 'P', type: 'CANVAS', children: [{ id: '1:1', name: 'F', type: 'FRAME', children: 'bad' }, { type: 'FRAME' }] }] };
    expect(framesFromDocument('K', 'File', '2026-01-01', doc).map((f) => f.name)).toEqual(['F']);
  });

  it('drops AI findings and challenges that do not match the output schema', () => {
    const finding = { category: 'GAP', severity: 'warning', dimension: 'design', title: 't', explanation: 'e', evidence: [{ ref: 'S1', quote: 'q' }] };
    const out = parseOutput(
      JSON.stringify({
        findings: [finding, { ...finding, severity: 'huge' }, { ...finding, evidence: 'S1' }, null, { ...finding, question: { text: 'q', options: 'a', topic: 't' } }],
        challenges: [{ question: 'q', rationale: 'r', options: ['a'], topic: 't' }, { question: 1 }],
      }),
    );
    expect(out.findings).toEqual([finding]);
    expect(out.challenges).toHaveLength(1);
  });
});
