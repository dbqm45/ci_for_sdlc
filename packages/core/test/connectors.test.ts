import { describe, expect, it } from 'vitest';
import { adfToText, framesFromDocument, splitSections } from '../src/index.js';

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
