import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { api, ApiError, client, setAuthRedirectHandler } from './http';
import { useAuthStore } from '@/stores/auth';
import type { PublicUser } from './http';

type AdapterResult = { status: number; data: unknown };

const fail = (status: number, code: string, message: string): AdapterResult => ({
  status,
  data: { success: false, error: { code, message } },
});

const envelope = <T,>(data: T) => ({ status: 200, data: { success: true, data } });

/** Swaps the axios adapter; the handler may also throw (network errors). */
function installAdapter(fn: (config: InternalAxiosRequestConfig) => AdapterResult): void {
  client.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const { status, data } = fn(config);
    const response = { data, status, statusText: String(status), headers: {}, config };
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        String(status),
        config,
        null,
        response as AxiosResponse,
      );
    }
    return response;
  }) as unknown as typeof client.defaults.adapter;
}

const makeUser = (): PublicUser => ({
  id: 'u-1',
  email: 'benjamin.thompson@university.edu',
  firstName: 'Benjamin S.',
  lastName: 'Thompson',
  role: 'student',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
});

function setStore(accessToken: string | null): void {
  useAuthStore.setState({
    user: accessToken ? makeUser() : null,
    accessToken,
    status: accessToken ? 'authenticated' : 'anonymous',
  });
}

const originalAdapter = client.defaults.adapter;
const redirect = vi.fn();

beforeEach(() => {
  setAuthRedirectHandler(redirect);
  redirect.mockClear();
  setStore(null);
});

afterEach(() => {
  client.defaults.adapter = originalAdapter;
});

describe('ApiError normalization', () => {
  it('unwraps the API error envelope', async () => {
    installAdapter(() => fail(422, 'VALIDATION_ERROR', 'Title is required'));

    const error = await api.get('/things').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Title is required',
    });
  });

  it('falls back to NETWORK_ERROR when there is no response', async () => {
    installAdapter(() => {
      throw new AxiosError('Network Error', 'ERR_NETWORK');
    });

    const error = await api.get('/things').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR', message: 'Network Error' });
  });

  it('constructs ApiError directly with status/code/message', () => {
    const error = new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Nope' });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });
});

describe('401 refresh queue', () => {
  it('refreshes once and replays the failed request with the new token', async () => {
    const user = makeUser();
    let refreshCalls = 0;
    installAdapter((config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        return envelope({ accessToken: 'new-token', expiresIn: 900, user });
      }
      const auth = config.headers.get('Authorization');
      if (auth === 'Bearer new-token') return envelope({ pong: true });
      return fail(401, 'UNAUTHORIZED', 'Access token expired');
    });
    setStore('old-token');

    const result = await api.get<{ pong: boolean }>('/auth/protected');

    expect(result).toEqual({ pong: true });
    expect(refreshCalls).toBe(1);
    expect(useAuthStore.getState().accessToken).toBe('new-token');
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('shares a single refresh across concurrent 401s', async () => {
    const user = makeUser();
    let refreshCalls = 0;
    installAdapter((config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        return envelope({ accessToken: 'new-token', expiresIn: 900, user });
      }
      return config.headers.get('Authorization') === 'Bearer new-token'
        ? envelope({ ok: true })
        : fail(401, 'UNAUTHORIZED', 'expired');
    });
    setStore('old-token');

    const [a, b] = await Promise.all([api.get('/a'), api.get('/b')]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
  });

  it('clears auth and redirects to /session-expired when refresh fails on a protected path', async () => {
    installAdapter(() => fail(401, 'UNAUTHORIZED', 'Refresh token is invalid'));
    setStore('stale-token');

    const error = await api.get('/auth/protected').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(useAuthStore.getState().status).toBe('anonymous');
    expect(useAuthStore.getState().accessToken).toBeNull();
    // jsdom pathname '/' is protected → session-expired (spec §3)
    expect(redirect).toHaveBeenCalledWith('/session-expired');
  });
});

describe('login 401 exclusion', () => {
  it('rejects inline without refreshing or navigating', async () => {
    let refreshCalls = 0;
    installAdapter((config) => {
      if (config.url === '/auth/refresh') refreshCalls += 1;
      return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    });
    setStore(null);

    const error = await api
      .post('/auth/login', { email: 'a@b.c', password: 'wrong' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
    expect(refreshCalls).toBe(0);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('403 handling', () => {
  it('rejects and redirects to /forbidden', async () => {
    installAdapter(() => fail(403, 'FORBIDDEN', 'Access restricted'));

    const error = await api.get('/auth/protected').catch((e: unknown) => e);

    expect((error as ApiError).status).toBe(403);
    expect(redirect).toHaveBeenCalledWith('/forbidden');
  });
});
