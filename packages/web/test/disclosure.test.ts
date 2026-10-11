import { describe, expect, it } from 'vitest';
import { disclosureReducer } from '../src/lib/disclosure';

describe('disclosureReducer', () => {
  it('D-01: opens from closed', () => {
    expect(disclosureReducer(false, 'open')).toBe(true);
  });

  it('D-02: closes from open', () => {
    expect(disclosureReducer(true, 'close')).toBe(false);
  });

  it('D-03: toggle flips state both ways', () => {
    expect(disclosureReducer(false, 'toggle')).toBe(true);
    expect(disclosureReducer(true, 'toggle')).toBe(false);
  });

  it('D-04: escape always closes, even if already closed', () => {
    expect(disclosureReducer(true, 'escape')).toBe(false);
    expect(disclosureReducer(false, 'escape')).toBe(false);
  });
});
