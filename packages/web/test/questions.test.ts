import { describe, expect, it } from 'vitest';
import type { Finding } from '@ci/core';
import { askedLine, localDateTime, orderFindings } from '../src/lib/questions';

// R1: questions people asked on the item page — newest first, times in the viewer's time zone.

const rule = (id: string) => ({ id, ruleId: 'R', status: 'open' }) as Finding;
const asked = (id: string, askedAt: string) => ({ id, ruleId: 'HUMAN-001', status: 'open', human: { author: 'Ola', askedAt, accepted: false } }) as Finding;

describe('item page questions', () => {
  it('QST-01: questions newest first, above the rules’ findings in their own order', () => {
    const list = [rule('r1'), asked('old', '2026-11-22T09:00:00.000Z'), rule('r2'), asked('new', '2026-11-23T20:35:53.000Z')];
    expect(orderFindings(list).map((f) => f.id)).toEqual(['new', 'old', 'r1', 'r2']);
  });

  it('QST-02: a UTC time shows in the viewer’s zone, with daylight saving time of that date', () => {
    expect(localDateTime('2026-11-23T20:35:53.000Z', 'Europe/Warsaw', 'en-GB')).toBe('23 Nov 2026, 21:35');
    expect(localDateTime('2026-07-01T20:35:00.000Z', 'Europe/Warsaw', 'en-GB')).toBe('1 Jul 2026, 22:35');
    expect(localDateTime('2026-11-23T20:35:53.000Z', 'America/New_York', 'en-GB')).toBe('23 Nov 2026, 15:35');
  });

  it('QST-03: the date is the viewer’s, not UTC’s, around midnight', () => {
    expect(localDateTime('2026-11-23T23:30:00.000Z', 'Europe/Warsaw', 'en-GB')).toBe('24 Nov 2026, 00:30');
  });

  it('QST-05: the same question is on another date for a viewer in Australia (summer time there in November)', () => {
    expect(localDateTime('2026-11-23T20:35:53.000Z', 'Australia/Sydney', 'en-GB')).toBe('24 Nov 2026, 07:35');
    expect(localDateTime('2026-07-01T20:35:00.000Z', 'Australia/Sydney', 'en-GB')).toBe('2 Jul 2026, 06:35');
  });

  it('QST-04: who asked, when and whether it counts yet', () => {
    expect(askedLine({ author: 'Ola', askedAt: '2026-11-23T20:35:53.000Z', accepted: false }, 'Europe/Warsaw', 'en-GB')).toBe(
      'Asked by Ola on 23 Nov 2026, 21:35; waiting for the Product Owner to accept it — until then it does not change readiness.',
    );
    expect(askedLine({ author: 'Ola', askedAt: '2026-11-23T20:35:53.000Z', accepted: true, acceptedBy: 'Ann' }, 'UTC', 'en-GB')).toBe(
      'Asked by Ola on 23 Nov 2026, 20:35; accepted for refinement by Ann.',
    );
  });
});
