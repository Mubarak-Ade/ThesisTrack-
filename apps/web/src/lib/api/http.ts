import axios, { type InternalAxiosRequestConfig, type Method } from 'axios';
import { useAuthStore } from '@/stores/auth';

// ── API payload types (spec §3 / §5 / §6) ─────────────────────────────

export type Role = 'student' | 'supervisor' | 'administrator';

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

/** POST /auth/login and POST /auth/refresh answer with the same shape. */
export interface LoginResponse {
  accessToken: string;
  expiresIn: number | string;
  user: PublicUser;
}

export interface InvitationPreviewUser {
  name: string;
  email: string;
  role: Role;
  registrationNumber: string | null;
}

export type InvitationPreviewStatus = 'valid' | 'already_activated' | 'invalid';

/** GET /auth/invitation/:token — always HTTP 200; route on `status`. */
export interface InvitationPreview {
  status: InvitationPreviewStatus;
  invitation: InvitationPreviewUser | null;
}

/**
 * Every API error, normalized: screens branch on `status`/`code`
 * (e.g. login "Authentication failed" vs "Account is not active").
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(init: { status: number; code: string; message: string; details?: unknown }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
  }
}

type Envelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

// ── Client ────────────────────────────────────────────────────────────

export const client = axios.create({ baseURL: '/api/v1', withCredentials: true });

/** Normalize anything thrown by axios into an ApiError (spec §6). */
export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 0;
    const body = error.response?.data as
      | { error?: { code?: string; message?: string; details?: unknown }; message?: string }
      | undefined;
    const envelope = body?.error;

    return new ApiError({
      status,
      code: envelope?.code ?? (status > 0 ? `HTTP_${status}` : 'NETWORK_ERROR'),
      message: envelope?.message ?? body?.message ?? error.message,
      details: envelope?.details,
    });
  }

  return new ApiError({
    status: 0,
    code: 'NETWORK_ERROR',
    message: error instanceof Error ? error.message : 'Network error',
  });
}

// ── Redirect plumbing (interceptors live outside the React tree) ──────

type RedirectHandler = (to: string) => void;

let redirectHandler: RedirectHandler = (to) => {
  window.location.assign(to);
};

/** AuthProvider injects react-router navigation so redirects stay SPA-side. */
export function setAuthRedirectHandler(handler: RedirectHandler): void {
  redirectHandler = handler;
}

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/session-expired',
  '/unauthorized',
  '/forbidden',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirect(to: string): void {
  if (window.location.pathname === to) return;
  redirectHandler(to);
}

/** Refresh really failed — the session is gone (spec §3/§6). */
function handleAuthFailure(): void {
  // The anonymous guard on a still-mounted protected route races this
  // redirect (its own /unauthorized would win from a later render). Declare
  // the target first so both actors land on the same URL — private pages
  // must show /session-expired, not /unauthorized.
  const to = isPublicPath(window.location.pathname) ? '/unauthorized' : '/session-expired';
  useAuthStore.getState().setExitTo(to);
  useAuthStore.getState().clear();
  redirect(to);
}

// ── Boot-time refresh ─────────────────────────────────────────────────

export async function refreshSession(): Promise<void> {
  const session = await api.post<LoginResponse>('/auth/refresh');
  useAuthStore.getState().setSession(session.user, session.accessToken);
}

let refreshPromise: Promise<void> | null = null;

/** Concurrent 401s share one in-flight refresh (spec §6 refresh queue). */
function ensureRefresh(): Promise<void> {
  refreshPromise ??= refreshSession().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

// ── Interceptors ──────────────────────────────────────────────────────

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

function isAuthUrl(config: InternalAxiosRequestConfig, suffix: string): boolean {
  return (config.url ?? '').endsWith(suffix);
}

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const err = normalizeError(error);
    const config = (axios.isAxiosError(error) ? error.config : undefined) as
      | RetriableConfig
      | undefined;

    if (err.status === 401 && config) {
      // Login 401 must render inline in the form (never navigate);
      // the refresh call itself must not recurse into this queue.
      const skip =
        isAuthUrl(config, '/auth/refresh') ||
        isAuthUrl(config, '/auth/login') ||
        config._retried === true;

      if (skip) return Promise.reject(err);

      config._retried = true;
      return ensureRefresh()
        .catch(() => {
          handleAuthFailure();
          return Promise.reject(err);
        })
        .then(() => client.request(config))
        .catch((e: unknown) => Promise.reject(e instanceof ApiError ? e : normalizeError(e)));
    }

    if (err.status === 403) {
      redirect('/forbidden');
    }

    return Promise.reject(err);
  },
);

// ── Typed helpers (replaces the old fetch-based lib/api.ts) ───────────

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  try {
    const res = await client.request<Envelope<T>>({ method, url: path, data: body });
    if (!res.data.success) {
      const { code, message, details } = res.data.error;
      throw new ApiError({ status: 0, code, message, details });
    }
    return res.data.data;
  } catch (error) {
    throw error instanceof ApiError ? error : normalizeError(error);
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
