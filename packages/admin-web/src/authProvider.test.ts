/**
 * Unit tests for the Refine authProvider. Verifies the Bearer-token
 * dance with localStorage and the 401-on-error → logout flow.
 *
 * The provider is intentionally small (≈70 lines); these tests pin
 * the small but important invariants so a refactor can't quietly
 * regress them.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authProvider, getAuthToken } from './authProvider';

describe('authProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('login: stores token + user on success', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          token: 'fake.jwt.token',
          adminUserId: 7,
          username: 'root',
          role: 'admin',
          expiresIn: 7200,
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await authProvider.login({ username: 'root', password: 'pw' });
    expect(result.success).toBe(true);
    expect(localStorage.getItem('admin_token')).toBe('fake.jwt.token');
    expect(JSON.parse(localStorage.getItem('admin_user') ?? '{}')).toMatchObject({
      adminUserId: 7,
      username: 'root',
      role: 'admin',
    });
  });

  it('login: throws on 401', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, code: 1100, message: 'invalid credentials' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(authProvider.login({ username: 'u', password: 'p' })).rejects.toThrow('invalid credentials');
    expect(localStorage.getItem('admin_token')).toBe(null);
  });

  it('logout: clears tokens + redirects', async () => {
    localStorage.setItem('admin_token', 'x');
    localStorage.setItem('admin_user', '{}');
    const result = await authProvider.logout();
    expect(result.success).toBe(true);
    expect(localStorage.getItem('admin_token')).toBe(null);
    expect(localStorage.getItem('admin_user')).toBe(null);
    expect(result.redirectTo).toBe('/login');
  });

  it('check: missing token → unauthenticated', async () => {
    const result = await authProvider.check();
    expect(result.authenticated).toBe(false);
    expect(result.redirectTo).toBe('/login');
  });

  it('check: present token → authenticated', async () => {
    localStorage.setItem('admin_token', 'x');
    const result = await authProvider.check();
    expect(result.authenticated).toBe(true);
  });

  it('onError: 401 → kick to /login', async () => {
    localStorage.setItem('admin_token', 'x');
    const result = await authProvider.onError({ statusCode: 401 } as unknown as Error);
    expect(result.logout).toBe(true);
    expect(localStorage.getItem('admin_token')).toBe(null);
    expect(result.redirectTo).toBe('/login');
  });

  it('onError: non-401 → return empty', async () => {
    localStorage.setItem('admin_token', 'x');
    const result = await authProvider.onError({ statusCode: 500 } as unknown as Error);
    expect(result).toEqual({});
    expect(localStorage.getItem('admin_token')).toBe('x');
  });

  it('getIdentity: parses stored user', async () => {
    localStorage.setItem('admin_user', JSON.stringify({ adminUserId: 9, username: 'root', role: 'admin' }));
    const id = await authProvider.getIdentity();
    expect(id).toMatchObject({ id: 9, username: 'root', role: 'admin' });
  });

  it('getIdentity: returns null when storage is empty', async () => {
    const id = await authProvider.getIdentity();
    expect(id).toBe(null);
  });

  it('getAuthToken: returns the stored token', () => {
    localStorage.setItem('admin_token', 'x.y.z');
    expect(getAuthToken()).toBe('x.y.z');
  });
});
