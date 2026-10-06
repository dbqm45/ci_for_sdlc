import { describe, expect, it } from 'vitest';
import { designCoveragePercent, type StateCoverage } from '../src/index.js';

const cov = (required: string[], missingInDesign: string[], inDesign: string[] = ['idle']): StateCoverage =>
  ({ required: required.map((state) => ({ state, because: 'x' })), inRequirements: [], inDesign, missingInDesign, missingInRequirements: [] }) as unknown as StateCoverage;

describe('designCoveragePercent', () => {
  it('is the share of required states that the design shows', () => {
    expect(designCoveragePercent(cov(['idle', 'success', 'error', 'loading'], ['error']))).toBe(75);
  });

  it('is 0 when the design shows no states at all', () => {
    expect(designCoveragePercent(cov(['idle', 'success'], ['idle', 'success'], []))).toBe(0);
  });

  it('is 100, not NaN, when nothing is required', () => {
    expect(designCoveragePercent(cov([], []))).toBe(100);
  });
});
