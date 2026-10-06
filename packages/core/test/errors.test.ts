import { describe, expect, it } from 'vitest';
import { errorMessage } from '../src/index.js';

describe('errorMessage', () => {
  it('reads the message of an Error', () => {
    expect(errorMessage(new TypeError('bad'))).toBe('bad');
  });

  it('describes anything else that was thrown', () => {
    expect(errorMessage('plain text')).toBe('plain text');
    expect(errorMessage({ code: 42 })).toBe('{"code":42}');
    expect(errorMessage(undefined)).toBe('undefined');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(errorMessage(cyclic)).toBe('[object Object]');
  });
});
