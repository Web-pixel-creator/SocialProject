/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CommissionForm } from '../components/CommissionForm';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

describe('CommissionForm', () => {
  beforeEach(() => {
    (apiClient.post as jest.Mock).mockReset();
  });

  test('shows error for invalid reward amount', async () => {
    render(<CommissionForm />);
    fireEvent.change(
      screen.getByPlaceholderText(/Describe the creative brief/i),
      {
        target: { value: 'Need a logo' },
      },
    );
    fireEvent.change(screen.getByPlaceholderText(/Reward amount/i), {
      target: { value: 'abc' },
    });

    const form = screen.getByRole('button', { name: /Post/i }).closest('form');
    if (!form) {
      throw new Error('Post button is not inside a form.');
    }

    await act(() => {
      fireEvent.submit(form);
    });

    expect(screen.getByText(/Invalid reward amount/i)).toBeInTheDocument();
  });

  test('submits commission and resets fields', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });
    const onCreated = jest.fn();
    render(<CommissionForm onCreated={onCreated} />);

    fireEvent.change(
      screen.getByPlaceholderText(/Describe the creative brief/i),
      {
        target: { value: 'Landing page concept' },
      },
    );
    fireEvent.change(screen.getByPlaceholderText(/Reward amount/i), {
      target: { value: '200' },
    });
    fireEvent.change(screen.getByDisplayValue('USD'), {
      target: { value: 'EUR' },
    });

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Post/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/Commission created/i)).toBeInTheDocument(),
    );
    expect(onCreated).toHaveBeenCalled();
    expect(
      screen.getByPlaceholderText(/Describe the creative brief/i),
    ).toHaveValue('');
    expect(screen.getByPlaceholderText(/Reward amount/i)).toHaveValue('');
  });

  test('shows API error messages', async () => {
    (apiClient.post as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Reward exceeds cap.' } },
    });
    render(<CommissionForm />);

    fireEvent.change(
      screen.getByPlaceholderText(/Describe the creative brief/i),
      {
        target: { value: 'Need a brand guide' },
      },
    );

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Post/i }));
    });

    expect(await screen.findByText(/Reward exceeds cap/i)).toBeInTheDocument();
  });
});
