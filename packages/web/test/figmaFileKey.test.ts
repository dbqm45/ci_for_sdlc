import { describe, expect, it } from 'vitest';
import { parseFigmaFileKey } from '../src/components/figmaFileKey';

describe('parseFigmaFileKey', () => {
  it('FK-01: passes a bare file key through unchanged', () => {
    expect(parseFigmaFileKey('H8m1p7HdTrezQ16CdOQQOt')).toBe('H8m1p7HdTrezQ16CdOQQOt');
  });

  it('FK-02: extracts the key from a /design/ URL with node-id and query params', () => {
    expect(parseFigmaFileKey('https://www.figma.com/design/H8m1p7HdTrezQ16CdOQQOt/Case-Mngmt-Tool?node-id=0-1&p=f&t=FMgOUUrxcnTX4rlQ-0')).toBe('H8m1p7HdTrezQ16CdOQQOt');
  });

  it('FK-03: extracts the key from a legacy /file/ URL', () => {
    expect(parseFigmaFileKey('https://www.figma.com/file/ABC123xyz/Some-Name')).toBe('ABC123xyz');
  });

  it('FK-04: extracts the key without the www subdomain or a trailing path', () => {
    expect(parseFigmaFileKey('figma.com/design/ABC123xyz')).toBe('ABC123xyz');
  });

  it('FK-05: trims surrounding whitespace on a bare key', () => {
    expect(parseFigmaFileKey('  ABC123xyz  ')).toBe('ABC123xyz');
  });
});
