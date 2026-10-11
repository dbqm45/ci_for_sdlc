// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { getFocusableElements, trapTabKey } from '../src/lib/focusTrap';

function makePanel() {
  const panel = document.createElement('div');
  panel.innerHTML = '<button id="a">A</button><button id="b">B</button><button id="c">C</button>';
  document.body.appendChild(panel);
  return panel;
}

describe('getFocusableElements', () => {
  it('FT-01: finds all focusable buttons inside the container', () => {
    const panel = makePanel();
    expect(getFocusableElements(panel).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('trapTabKey', () => {
  it('FT-02: wraps Tab from the last element back to the first', () => {
    const panel = makePanel();
    const last = panel.querySelector<HTMLElement>('#c')!;
    const first = panel.querySelector<HTMLElement>('#a')!;
    last.focus();
    const e = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;
    trapTabKey(e, panel);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(first);
  });

  it('FT-03: wraps Shift+Tab from the first element back to the last', () => {
    const panel = makePanel();
    const last = panel.querySelector<HTMLElement>('#c')!;
    const first = panel.querySelector<HTMLElement>('#a')!;
    first.focus();
    const e = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent;
    trapTabKey(e, panel);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(last);
  });

  it('FT-04: ignores keys other than Tab', () => {
    const panel = makePanel();
    panel.querySelector<HTMLElement>('#b')!.focus();
    const e = { key: 'Escape', shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent;
    trapTabKey(e, panel);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
