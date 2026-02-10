/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  const { user, token, loading, login, register, logout } = useAuth();
  return (
    <div>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      <button
        onClick={() => login('user@example.com', 'password123')}
        type="button"
      >
        login
      </button>
      <button
        onClick={() =>
          register('reg@example.com', 'password123', {
            terms: true,
            privacy: true,
          })
        }
        type="button"
      >
        register
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
