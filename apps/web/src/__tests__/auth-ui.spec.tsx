/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AuthForm } from '../components/AuthForm';
import { AuthProvider } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<AuthProvider>{ui}</AuthProvider>);
};

describe('auth UI', () => {
  beforeEach(() => {
    (apiClient.post as jest.Mock).mockReset();
  });

  test('registration requires consent', async () => {
    renderWithProvider(<AuthForm mode="register" />);

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'secret' },
    });
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    });

    expect(await screen.findByText(/accept the Terms/i)).toBeInTheDocument();
  });

  test('registration submits when consent is provided', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {
        tokens: { accessToken: 'token' },
        userId: 'u1',
        email: 'user@example.com',
      },
    });

    renderWithProvider(<AuthForm mode="register" />);
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'pass' },
    });
    fireEvent.click(screen.getByLabelText(/Terms of Service/i));
    fireEvent.click(screen.getByLabelText(/Privacy Policy/i));

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Create account/i }));
    });

    expect(apiClient.post).toHaveBeenCalledWith('/auth/register', {
      email: 'user@example.com',
      password: 'pass',
      consent: { termsAccepted: true, privacyAccepted: true },
    });
  });

  test('login submits credentials', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {
        tokens: { accessToken: 'token' },
        userId: 'u1',
        email: 'user@example.com',
      },
    });

    renderWithProvider(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'pass' },
    });
    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    });

    expect(apiClient.post).toHaveBeenCalled();
  });

  test('shows error message on failed login', async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Invalid credentials' } },
    });

    renderWithProvider(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'pass' },
    });

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    });

    expect(await screen.findByText(/Invalid credentials/i)).toBeInTheDocument();
  });

  test('shows default error message when response payload is missing', async () => {
    (apiClient.post as jest.Mock).mockRejectedValue(new Error('Network down'));

    renderWithProvider(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'pass' },
    });

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    });

    expect(
      await screen.findByText(/Something went wrong/i),
    ).toBeInTheDocument();
  });
});
