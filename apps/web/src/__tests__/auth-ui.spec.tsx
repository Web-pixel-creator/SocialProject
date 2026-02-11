/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthForm } from '../components/AuthForm';
import { AuthProvider } from '../contexts/AuthContext';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(),
    get: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<AuthProvider>{ui}</AuthProvider>);
};

const submitAndWait = async (label: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: label }));
  await waitFor(() =>
    expect(screen.queryByText(/Processing\.\.\./i)).not.toBeInTheDocument(),
  );
};

describe('auth UI', () => {
  beforeEach(() => {
    localStorage.clear();
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockReset();
  });

  test('registration requires consent', async () => {
    renderWithProvider(<AuthForm mode="register" />);

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'secret' },
    });
    await submitAndWait(/Create account/i);

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

    await submitAndWait(/Create account/i);

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
    await submitAndWait(/Sign in/i);

    expect(apiClient.post).toHaveBeenCalled();
  });

  test('calls onSuccess after successful login', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: {
        tokens: { accessToken: 'token' },
        userId: 'u1',
        email: 'user@example.com',
      },
    });
    const onSuccess = jest.fn();

    renderWithProvider(<AuthForm mode="login" onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'pass' },
    });

    await submitAndWait(/Sign in/i);

    expect(onSuccess).toHaveBeenCalledTimes(1);
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

    await submitAndWait(/Sign in/i);

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

    await submitAndWait(/Sign in/i);

    expect(await screen.findByText(/Network down/i)).toBeInTheDocument();
  });
});
