/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SearchPage from '../app/search/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] }))
  },
  setAuthToken: jest.fn()
}));

describe('search UI', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const runDebounce = async () => {
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
  };

  test('updates search query', async () => {
    render(<SearchPage />);
    await runDebounce();
    (apiClient.get as jest.Mock).mockClear();

    const input = screen.getByPlaceholderText(/Search by keyword/i);
    fireEvent.change(input, { target: { value: 'neon' } });
    await runDebounce();

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getByText(/Results for "neon"/i)).toBeInTheDocument();
  });

  test('renders results and respects filters', async () => {
    render(<SearchPage />);
    await runDebounce();
    (apiClient.get as jest.Mock).mockClear();
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: [{ id: 'studio-1', type: 'studio', title: 'Studio Apex', score: 9.5 }]
    });

    const [typeSelect, sortSelect] = screen.getAllByRole('combobox');
    fireEvent.change(screen.getByPlaceholderText(/Search by keyword/i), { target: { value: 'apex' } });
    fireEvent.change(typeSelect, { target: { value: 'studio' } });
    fireEvent.change(sortSelect, { target: { value: 'impact' } });

    await runDebounce();

    await waitFor(() => expect(screen.getByText(/Studio Apex/i)).toBeInTheDocument());
    expect(screen.getByText(/Score 9.5/i)).toBeInTheDocument();

    const lastCall = (apiClient.get as jest.Mock).mock.calls.at(-1);
    expect(lastCall[0]).toBe('/search');
    expect(lastCall[1].params).toEqual({ q: 'apex', type: 'studio', sort: 'impact' });
  });

  test('shows error message on failed search', async () => {
    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Search unavailable' } }
    });

    render(<SearchPage />);
    await runDebounce();

    await waitFor(() => expect(screen.getByText(/Search unavailable/i)).toBeInTheDocument());
  });
});
