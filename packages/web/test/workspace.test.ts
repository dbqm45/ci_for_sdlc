import { describe, expect, it } from 'vitest';
import { apiUrl, hashPath, parseHashPath } from '../src/lib/workspace';

// F5 (docs/WORKSPACES-F5-PLAN.md): `#/w/<id>/…` names a workspace; its requests go to /api/w/<id>/…, shared ones stay.

describe('workspace in the address', () => {
  it.each([
    ['/item/PAY-1', { path: '/item/PAY-1' }],
    ['', { path: '/overview' }],
    ['/w/mobile/item/PAY-1/ERR-003%3APAY-1', { ws: 'mobile', path: '/item/PAY-1/ERR-003%3APAY-1' }],
    ['/w/mobile', { ws: 'mobile', path: '/overview' }],
    ['/w/default/settings', { ws: 'default', path: '/settings' }],
  ])('WSU-01: %s', (hash, expected) => {
    expect(parseHashPath(hash)).toEqual(expected);
  });

  it('WSU-02: default keeps the old addresses', () => {
    expect(hashPath('/backlog', 'default')).toBe('/backlog');
    expect(hashPath('/backlog', 'mobile')).toBe('/w/mobile/backlog');
  });
});

describe('API URL of a workspace', () => {
  it.each([
    ['/api/analysis', 'default', '/api/analysis'],
    ['/api/analysis', 'mobile', '/api/w/mobile/analysis'],
    ['/api/items/PAY-1/answers/x', 'mobile', '/api/w/mobile/items/PAY-1/answers/x'],
    ['/api/impact?q=refund', 'mobile', '/api/w/mobile/impact?q=refund'],
    ['/api/changes', 'mobile', '/api/changes'],
    ['/api/changes/CHG-12/request-approval', 'mobile', '/api/changes/CHG-12/request-approval'],
    ['/api/workspaces', 'mobile', '/api/workspaces'],
    ['/api/pdi', 'mobile', '/api/pdi'],
    ['/api/rules', 'mobile', '/api/rules'],
  ])('WSU-03: %s in %s → %s', (url, ws, expected) => {
    expect(apiUrl(url, ws)).toBe(expected);
  });
});
