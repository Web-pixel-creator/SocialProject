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
      <button onClick={() => login('user@example.com', 'pass')} type="button">
        login
      </button>
      <button
        onClick={() =>
          register('reg@example.com', 'pass', { terms: true, privacy: true })
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
    (setAuthToken as jest.Mock).mockReset();
  });

  test('hydrates from localStorage', async () => {
    localStorage.setItem('finishit_token', 'stored-token');
    localStorage.setItem(
      'finishit_user',
      JSON.stringify({ id: 'u1', email: 'stored@example.com' }),
    );

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('loading')).toHaveTextContent('no'),
    );
    expect(screen.getByTestId('user')).toHaveTextContent('stored@example.com');
    expect(screen.getByTestId('token')).toHaveTextContent('stored-token');
    expect(setAuthToken).toHaveBeenCalledWith('stored-token');
  });

  test('login/register/logout update state', async () => {
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

  test('login and register fall back to token and nested user fields', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        token: 'token-fallback',
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
      expect(screen.getByTestId('token')).toHaveTextContent('token-fallback'),
    );
    expect(screen.getByTestId('user')).toHaveTextContent(
      'fallback@example.com',
    );

    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        token: 'reg-fallback',
        user: { id: 'u-reg', email: 'reg-fallback@example.com' },
      },
    });

    fireEvent.click(screen.getByText('register'));
    await waitFor(() =>
      expect(screen.getByTestId('token')).toHaveTextContent('reg-fallback'),
    );
    expect(screen.getByTestId('user')).toHaveTextContent(
      'reg-fallback@example.com',
    );
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
