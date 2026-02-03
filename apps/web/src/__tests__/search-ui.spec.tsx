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
  test('updates search query', async () => {
    await act(async () => {
      render(<SearchPage />);
    });
    const input = screen.getByPlaceholderText(/Search by keyword/i);
    await act(async () => {
      fireEvent.change(input, { target: { value: 'neon' } });
    });
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.getByText(/Results for "neon"/i)).toBeInTheDocument();
  });
});
