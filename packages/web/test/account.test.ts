import { describe, expect, it } from 'vitest';
import { assignableRoles, canManage, disabledReason, loginErrorFrom, roleLabel, showLogin, type Me } from '../src/lib/account';
import { authStep } from '../src/lib/auth';

// Accounts mode (docs/ACCOUNTS-PLAN.md, stage 2): the login screen, the person menu and buttons a role may not use.

const person = (role: 'owner' | 'admin' | 'member' | 'viewer'): Me => ({ mode: 'accounts', user: { id: 'u1', name: 'Mia Member', email: '', role } });
const TOKEN: Me = { mode: 'token', user: null };

describe('who is logged in', () => {
  it('ACC-01: the login screen shows only in accounts mode without a user', () => {
    expect(showLogin({ mode: 'accounts', user: null })).toBe(true);
    expect(showLogin(person('viewer'))).toBe(false);
    expect(showLogin(TOKEN)).toBe(false);
    expect(showLogin(undefined)).toBe(false);
  });

  it('ACC-02: the login error comes from the address', () => {
    expect(loginErrorFrom('?login_error=This%20invitation%20is%20no%20longer%20valid.')).toBe('This invitation is no longer valid.');
    expect(loginErrorFrom('?x=1')).toBe('');
    expect(loginErrorFrom('')).toBe('');
  });

  it('ACC-03: roles have readable names', () => {
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('viewer')).toBe('Viewer');
  });
});

describe('buttons a role may not use', () => {
  it.each([
    ['token mode never disables', TOKEN, 'admin', undefined],
    ['before /me is known nothing is disabled', undefined, 'admin', undefined],
    ['a strong enough role', person('admin'), 'member', undefined],
    ['the same role', person('member'), 'member', undefined],
    ['a Viewer cannot analyse', person('viewer'), 'member', 'Needs the Member role'],
    ['a Member cannot change settings', person('member'), 'admin', 'Needs the Admin role'],
    ['an Admin cannot do what only the Owner does', person('admin'), 'owner', 'Needs the Owner role'],
  ] as const)('ACC-04: %s', (_, me, need, expected) => {
    expect(disabledReason(me, need)).toBe(expected);
  });
});

describe('managing members', () => {
  it('ACC-05: an Admin gives every role but Owner; the Owner gives all', () => {
    expect(assignableRoles('owner')).toEqual(['owner', 'admin', 'member', 'viewer']);
    expect(assignableRoles('admin')).toEqual(['admin', 'member', 'viewer']);
    expect(assignableRoles('member')).toEqual([]);
  });

  it('ACC-06: an Admin cannot change or remove the Owner', () => {
    expect(canManage('owner', 'owner')).toBe(true);
    expect(canManage('admin', 'owner')).toBe(false);
    expect(canManage('admin', 'member')).toBe(true);
    expect(canManage('member', 'viewer')).toBe(false);
  });
});

describe('tokens in accounts mode', () => {
  it('ACC-07: a 401 never asks for a token; a person logs in instead', () => {
    expect(authStep({ status: 401, challenge: true, retried: false, used: '', current: '', accounts: true })).toBe('fail');
    expect(authStep({ status: 401, challenge: true, retried: false, used: '', current: '' })).toBe('prompt');
  });
});
