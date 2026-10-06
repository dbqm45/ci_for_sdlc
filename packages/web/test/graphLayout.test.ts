import { describe, expect, it } from 'vitest';
import type { RelationType } from '@ci/core';
import type { GraphData } from '../src/api';
import { ALL, edgePath, HEAD_H, itemHref, layoutGraph, MAX_LABEL, neighbours, ROW_H, type Via } from '../src/components/graphLayout';

// Shaped like the demo neighbourhood of PAY-123: parent epic, a Confluence page, 8 Figma frames, a domain.
const node = (id: string, source: string | undefined, title: string, kind = 'x') => ({ id, kind, source, title });
const edge = (from: string, to: string, type: RelationType, via: Via, confidence = 1) => ({ from, to, type, via, confidence, reason: '' });
const frames = ['Default', 'Loading', 'Validation error', 'Error', 'Success', 'Timeout', 'Offline', 'Session expired'];
const PAY123: GraphData = {
  center: 'jira:PAY-123',
  nodes: [
    node('jira:PAY-123', 'jira', 'PAY-123 — Save payment method', 'story'),
    node('jira:PAY-100', 'jira', 'PAY-100 — Saved Payment Methods', 'epic'),
    node('confluence:2001', 'confluence', 'Saved Payment Methods – Business Rules'),
    ...frames.map((f, i) => node(`figma:${i + 1}`, 'figma', `Checkout App / Add card / ${f}`)),
    node('domain:Payments', undefined, 'Payments', 'domain'),
  ],
  edges: [
    edge('jira:PAY-123', 'jira:PAY-100', 'belongs_to', 'explicit'),
    edge('jira:PAY-123', 'confluence:2001', 'documented_by', 'explicit'),
    edge('jira:PAY-100', 'confluence:2001', 'documented_by', 'explicit'),
    edge('jira:PAY-123', 'figma:1', 'designed_by', 'explicit'),
    edge('figma:1', 'figma:2', 'related_to', 'explicit'),
    ...frames.slice(1).map((_, i) => edge('jira:PAY-123', `figma:${i + 2}`, 'designed_by', 'semantic', 0.85)),
    edge('jira:PAY-100', 'figma:5', 'designed_by', 'semantic', 0.51),
    edge('jira:PAY-123', 'domain:Payments', 'in_domain', 'explicit', 0.99),
  ],
};

describe('GRF-U01 layout of an item neighbourhood', () => {
  const g = layoutGraph(PAY123);

  it('shows every neighbour except the domain, which is named under the item', () => {
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['confluence:2001', 'jira:PAY-100', ...frames.map((_, i) => `figma:${i + 1}`)].sort());
    expect(g.center).toMatchObject({ key: 'PAY-123', title: 'Save payment method', domains: ['Payments'] });
    expect(g.edges.some((e) => e.to === 'domain:Payments')).toBe(false);
  });

  it('keeps labels apart: one row per neighbour in each column', () => {
    for (const side of ['left', 'right'] as const) {
      const ys = g.nodes.filter((n) => n.side === side).map((n) => n.y).sort((a, b) => a - b);
      ys.slice(1).forEach((y, i) => expect(y - ys[i]!).toBeGreaterThanOrEqual(ROW_H));
    }
  });

  it('balances the columns (10 neighbours → 5 + 5) and orders Jira, Confluence, then Figma', () => {
    expect(g.nodes.filter((n) => n.side === 'left')).toHaveLength(5);
    expect(g.nodes.map((n) => n.source)).toEqual(['jira', 'confluence', 'figma', 'figma', 'figma', 'figma', 'figma', 'figma', 'figma', 'figma']);
    expect(g.headings.map((h) => `${h.side}:${h.source}:${h.count}`)).toEqual(['left:jira:1', 'left:confluence:1', 'left:figma:3', 'right:figma:5']);
  });

  it('puts explicit links before semantic ones and says how each node relates to the item', () => {
    const figma = g.nodes.filter((n) => n.source === 'figma');
    expect(figma[0]).toMatchObject({ id: 'figma:1', relation: 'designed by · explicit' });
    expect(figma[1]?.relation).toBe('designed by · semantic 85%');
    expect(g.nodes[0]?.relation).toBe('belongs to · explicit');
  });

  it('fits everything inside the drawing, with the item in the middle', () => {
    for (const n of g.nodes) {
      expect(n.y - ROW_H / 2).toBeGreaterThanOrEqual(0);
      expect(n.y + ROW_H / 2).toBeLessThanOrEqual(g.height);
    }
    expect(g.center.x).toBeCloseTo(g.width / 2, 0);
    expect(Math.min(...g.headings.map((h) => h.y))).toBeGreaterThanOrEqual(HEAD_H / 2);
  });
});

describe('GRF-U02 filters', () => {
  it('hiding a source removes its nodes and their edges', () => {
    const g = layoutGraph(PAY123, { ...ALL, sources: new Set(['jira', 'confluence']) });
    expect(g.nodes.map((n) => n.id)).toEqual(['jira:PAY-100', 'confluence:2001']);
    expect(g.edges.every((e) => !e.from.startsWith('figma') && !e.to.startsWith('figma'))).toBe(true);
  });

  it('hiding semantic links keeps only nodes that still have an explicit link', () => {
    const g = layoutGraph(PAY123, { ...ALL, via: new Set<Via>(['explicit']) });
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['confluence:2001', 'figma:1', 'figma:2', 'jira:PAY-100']);
    expect(g.nodes.find((n) => n.id === 'figma:2')?.relation).toBe('indirect');
  });

  it('an empty selection leaves just the item', () => {
    const g = layoutGraph(PAY123, { sources: new Set(), via: new Set() });
    expect(g.nodes).toEqual([]);
    expect(g.height).toBeGreaterThan(0);
  });
});

describe('GRF-U03 helpers', () => {
  it.each([
    { id: 'long', title: 'x'.repeat(80), label: 'x'.repeat(MAX_LABEL - 1) + '…' },
    { id: 'at limit', title: 'y'.repeat(MAX_LABEL), label: 'y'.repeat(MAX_LABEL) },
  ])('$id titles are shortened to $label.length characters', ({ title, label }) => {
    const g = layoutGraph({ ...PAY123, nodes: PAY123.nodes.map((n) => (n.id === 'jira:PAY-100' ? { ...n, title } : n)) });
    expect(g.nodes.find((n) => n.id === 'jira:PAY-100')).toMatchObject({ title, label });
  });

  it('neighbours of a node include itself and both link directions', () => {
    const g = layoutGraph(PAY123);
    expect([...neighbours(g.edges, 'jira:PAY-100')].sort()).toEqual(['confluence:2001', 'figma:5', 'jira:PAY-100', 'jira:PAY-123']);
  });

  it('Jira nodes link inside the app, others do not', () => {
    expect(itemHref('jira:PAY-100')).toBe('#/item/PAY-100');
    expect(itemHref('figma:1')).toBeUndefined();
  });

  it('edges between columns are S-curves, edges within a column bend towards the item, away from the labels', () => {
    expect(edgePath({ x: 0, y: 0 }, { x: 100, y: 50 })).toBe('M0,0 C50,0 50,50 100,50');
    expect(edgePath({ x: 10, y: 0 }, { x: 10, y: 60 }, 'left')).toBe('M10,0 Q54,30 10,60');
    expect(edgePath({ x: 10, y: 0 }, { x: 10, y: 60 }, 'right')).toBe('M10,0 Q-34,30 10,60');
  });
});
