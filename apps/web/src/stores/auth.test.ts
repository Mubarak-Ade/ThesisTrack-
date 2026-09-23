import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from './auth';
import type { PublicUser } from '../lib/http';

const user: PublicUser = {
  id: 'u-1',
  email: 'ada@university.edu',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'supervisor',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
};

beforeEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, status: 'unknown', exitTo: null });
});

describe('auth store', () => {
  it('starts unknown with no session', () => {
    const { status, user, accessToken } = useAuthStore.getState();
    expect(status).toBe('unknown');
    expect(user).toBeNull();
    expect(accessToken).toBeNull();
  });

  it('setSession authenticates with user + in-memory token', () => {
    useAuthStore.getState().setSession(user, 'token-123');

    const state = useAuthStore.getState();
    expect(state.status).toBe('authenticated');
    expect(state.user).toEqual(user);
    expect(state.accessToken).toBe('token-123');
  });

  it('clear returns to anonymous and drops the token', () => {
    useAuthStore.getState().setSession(user, 'token-123');
    useAuthStore.getState().clear();

    const state = useAuthStore.getState();
    expect(state.status).toBe('anonymous');
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it('never persists the access token (no localStorage)', () => {
    useAuthStore.getState().setSession(user, 'token-123');

    expect(window.localStorage.getItem('accessToken')).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });
});
