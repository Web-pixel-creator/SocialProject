/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AuthForm } from '../components/AuthForm';
import { AuthProvider } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn()
  },
  setAuthToken: jest.fn()
}));

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<AuthProvider>{ui}</AuthProvider>);
};

describe('auth UI', () => {
  test('registration requires consent', async () => {
    renderWithProvider(<AuthForm mode="register" />);

    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'secret' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    });

    expect(await screen.findByText(/accept the Terms/i)).toBeInTheDocument();
  });

  test('login submits credentials', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { tokens: { accessToken: 'token' }, userId: 'u1', email: 'user@example.com' }
    });

    renderWithProvider(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'pass' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    });

    expect(apiClient.post).toHaveBeenCalled();
  });
});
