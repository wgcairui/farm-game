/**
 * Auth shape + storage helpers for the admin-web UI.
 *
 * Per `docs/admin-integration.md` v2 §2 + ADR-0006 D46: the admin
 * SPA runs on its own origin (5173 in dev, served by Nginx in prod),
 * authenticates to Fastify via the `/admin-ops/auth/login` JWT
 * endpoint, and stores the resulting token in `localStorage` so a
 * page reload doesn't bounce the operator back to /login.
 *
 * We deliberately avoid cookies because (a) the admin app is served
 * from a different origin than the API once Nginx is in front, and
 * (b) cookies would invite CSRF protection work that adds no value
 * to a token-gated UI. Bearer header is fine here.
 *
 * The `authProvider` object also implements Refine's `AuthBindings`
 * shape so we can hand it to `<Refine>` for the data hooks that
 * rely on it; the page-level code that needs to mutate login
 * state uses `loginRequest` / `storeLogin` / `clearLogin` directly.
 */

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

export interface AdminIdentity {
  adminUserId: number;
  username: string;
  role: string;
}

export interface LoginResponse {
  token: string;
  adminUserId: number;
  username: string;
  role: string;
  expiresIn: number;
}

interface ApiSuccess<T> { ok: true; data: T }
interface ApiFailure { ok: false; code: number; message: string }
type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export const getAuthToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export function storeLogin(user: LoginResponse): void {
  localStorage.setItem(TOKEN_KEY, user.token);
  localStorage.setItem(USER_KEY, JSON.stringify({
    adminUserId: user.adminUserId,
    username: user.username,
    role: user.role,
  } satisfies AdminIdentity));
}

export function clearLogin(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredIdentity(): AdminIdentity | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminIdentity;
  } catch {
    return null;
  }
}

export async function loginRequest(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch('/admin-ops/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json()) as ApiEnvelope<LoginResponse>;
  if (!res.ok || !body.ok) {
    const message = body.ok ? `login failed (${res.status})` : body.message;
    throw new Error(message);
  }
  return body.data;
}

/**
 * Refine AuthBindings shim — small enough to keep typed without
 * depending on Refine's churn-prone generics.
 */
export const authProvider = {
  async login({ username, password }: { username: string; password: string }) {
    const user = await loginRequest(username, password);
    storeLogin(user);
    return { success: true as const, redirectTo: '/' };
  },

  async logout() {
    clearLogin();
    return { success: true as const, redirectTo: '/login' };
  },

  async check() {
    return getAuthToken()
      ? { authenticated: true as const }
      : { authenticated: false as const, redirectTo: '/login' };
  },

  async getPermissions() {
    const id = getStoredIdentity();
    return id?.role ?? null;
  },

  async getIdentity() {
    const id = getStoredIdentity();
    if (!id) return null;
    return { id: id.adminUserId, ...id };
  },

  async onError(error: unknown) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 401) {
      clearLogin();
      return { logout: true as const, redirectTo: '/login' };
    }
    return {};
  },
};
