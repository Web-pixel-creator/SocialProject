/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { apiClient, setAuthToken } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

const Consumer = () => {
  const { user, token, loading, login, register, refreshSession, logout } =
    useAuth();
  const [actionError, setActionError] = useState<string>('none');
  const [refreshError, setRefreshError] = useState<string>('none');
  return (
    <div>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      <span data-testid="action-error">{actionError}</span>
      <span data-testid="refresh-error">{refreshError}</span>
      <button
        onClick={async () => {
          setActionError('none');
          try {
            await login('user@example.com', 'password123');
          } catch (error) {
            setActionError(
              error instanceof Error ? error.message : 'Unknown error',
            );
          }
        }}
        type="button"
      >
        login
      </button>
      <button
        onClick={async () => {
          setActionError('none');
          try {
            await register('reg@example.com', 'password123', {
              terms: true,
              privacy: true,
            });
          } catch (error) {
            setActionError(
              error instanceof Error ? error.message : 'Unknown error',
            );
          }
        }}
        type="button"
      >
        register
      </button>
      <button
        onClick={async () => {
          setRefreshError('none');
          try {
            await refreshSession();
          } catch (error) {
            setRefreshError(
              error instanceof Error ? error.message : 'Unknown error',
            );
          }
        }}
        type="button"
      >
        refresh
      </button>
      <button onClick={logout} type="button">
        logout
      </button>
    </div>
  );
};

describe('auth context', () => {
  beforeEach(() => {
    localStorage.clear();
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockReset();
    (setAuthToken as jest.Mock).mockReset();
  });

  test('hydrates from localStorage and validates token with /auth/me', async () => {
    localStorage.setItem('finishit_token', 'stored-token');
    localStorage.setItem(
      'finishit_user',
      JSON.stringify({ user: { id: 'u1', email: 'cached@example.com' } }),
    );
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        user: { id: 'u1', email: 'server@example.com' },
      },
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('no'),
    );
    expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
    expect(screen.getByTestId('user')).toHaveTextContent('server@example.com');
    expect(screen.getByTestId('token')).toHaveTextContent('stored-token');
    expect(setAuthToken).toHaveBeenCalledWith('stored-token');
  });

  test('clears invalid stored session when /auth/me fails', async () => {
    localStorage.setItem('finishit_token', 'expired-token');
    localStorage.setItem(
      'finishit_user',
      JSON.stringify({ user: { id: 'u2', email: 'expired@example.com' } }),
    );
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('no'),
    );
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(setAuthToken).toHaveBeenCalledWith('expired-token');
    expect(setAuthToken).toHaveBeenCalledWith(null);
  });

  test('login/register/logout update state with direct payload user', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        tokens: { accessToken: 'token-1' },
        userId: 'u1',
        email: 'user@example.com',
      },
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('login'));
    await waitFor(() =>
      expect(screen.getByTestId('token')).toHaveTextContent('token-1'),
    );
    expect(setAuthToken).toHaveBeenCalledWith('token-1');

    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        tokens: { accessToken: 'token-2' },
        userId: 'u2',
        email: 'reg@example.com',
      },
    });

    fireEvent.click(screen.getByText('register'));
    await waitFor(() =>
      expect(screen.getByTestId('token')).toHaveTextContent('token-2'),
    );

    fireEvent.click(screen.getByText('logout'));
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(setAuthToken).toHaveBeenCalledWith(null);
  });

  test('register falls back to /auth/me when response does not include user', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        tokens: { accessToken: 'token-register-fallback' },
      },
    });
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        user: { id: 'u-register', email: 'reg-fallback@example.com' },
      },
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('register'));
    await waitFor(() =>
      expect(screen.getByTestId('token')).toHaveTextContent(
        'token-register-fallback',
      ),
    );
    expect(screen.getByTestId('user')).toHaveTextContent(
      'reg-fallback@example.com',
    );
    expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
  });

  test('refreshSession updates user when token is valid', async () => {
    localStorage.setItem('finishit_token', 'refresh-token');
    localStorage.setItem(
      'finishit_user',
      JSON.stringify({
        user: { id: 'u-refresh', email: 'cached@example.com' },
      }),
    );
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          user: { id: 'u-refresh', email: 'before-refresh@example.com' },
        },
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: 'u-refresh', email: 'after-refresh@example.com' },
        },
      });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('no'),
    );
    expect(screen.getByTestId('user')).toHaveTextContent(
      'before-refresh@example.com',
    );

    fireEvent.click(screen.getByText('refresh'));
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(
        'after-refresh@example.com',
      ),
    );
    expect(screen.getByTestId('refresh-error')).toHaveTextContent('none');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  test('refreshSession clears session and surfaces error when /auth/me fails', async () => {
    localStorage.setItem('finishit_token', 'refresh-token');
    localStorage.setItem(
      'finishit_user',
      JSON.stringify({
        user: { id: 'u-refresh', email: 'cached@example.com' },
      }),
    );
    (apiClient.get as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          user: { id: 'u-refresh', email: 'before-refresh@example.com' },
        },
      })
      .mockRejectedValueOnce(new Error('Session expired'));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('no'),
    );
    expect(screen.getByTestId('token')).toHaveTextContent('refresh-token');

    fireEvent.click(screen.getByText('refresh'));

    await waitFor(() =>
      expect(screen.getByTestId('token')).toHaveTextContent('none'),
    );
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('refresh-error')).toHaveTextContent(
      'Session expired',
    );
    expect(setAuthToken).toHaveBeenCalledWith(null);
    expect(localStorage.getItem('finishit_token')).toBeNull();
    expect(localStorage.getItem('finishit_user')).toBeNull();
  });

  test('refreshSession clears stale local storage when token is missing', async () => {
    localStorage.setItem(
      'finishit_user',
      JSON.stringify({ user: { id: 'u-stale', email: 'stale@example.com' } }),
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('no'),
    );
    expect(screen.getByTestId('token')).toHaveTextContent('none');

    fireEvent.click(screen.getByText('refresh'));

    await waitFor(() =>
      expect(screen.getByTestId('refresh-error')).toHaveTextContent('none'),
    );
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(setAuthToken).toHaveBeenCalledWith(null);
    expect(localStorage.getItem('finishit_token')).toBeNull();
    expect(localStorage.getItem('finishit_user')).toBeNull();
  });

  test('bootstraps with malformed stored user payload and restores from /auth/me', async () => {
    localStorage.setItem('finishit_token', 'stored-token');
    localStorage.setItem('finishit_user', '{not-json');
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        user: { id: 'u-malformed', email: 'restored@example.com' },
      },
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('no'),
    );
    expect(screen.getByTestId('token')).toHaveTextContent('stored-token');
    expect(screen.getByTestId('user')).toHaveTextContent(
      'restored@example.com',
    );
    expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
  });

  test('shows auth error when login payload misses token', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        userId: 'u-missing-token',
        email: 'missing-token@example.com',
      },
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('login'));
    await waitFor(() =>
      expect(screen.getByTestId('action-error')).toHaveTextContent(
        'Missing token in authentication response',
      ),
    );
    expect(screen.getByTestId('token')).toHaveTextContent('none');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  test('login falls back to /auth/me when response does not include user', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        tokens: { accessToken: 'token-no-user' },
      },
    });
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        user: { id: 'u-fallback', email: 'fallback@example.com' },
      },
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByText('login'));
    await waitFor(() =>
      expect(screen.getByTestId('token')).toHaveTextContent('token-no-user'),
    );
    expect(screen.getByTestId('user')).toHaveTextContent(
      'fallback@example.com',
    );
    expect(apiClient.get).toHaveBeenCalledWith('/auth/me');
  });

  test('useAuth throws outside provider', () => {
    const Broken = () => {
      useAuth();
      return null;
    };
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      expect(() => render(<Broken />)).toThrow(
        'useAuth must be used within AuthProvider',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
