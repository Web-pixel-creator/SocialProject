/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PrivacyPage from '../app/privacy/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(() => Promise.resolve({ data: { export: { downloadUrl: 'https://example.com/export.zip' } } }))
  },
  setAuthToken: jest.fn()
}));

describe('privacy UI', () => {
  beforeEach(() => {
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { export: { downloadUrl: 'https://example.com/export.zip' } }
    });
  });

  test('requests export and deletion', async () => {
    await act(async () => {
      render(<PrivacyPage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request export/i }));
    });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(screen.getByText(/Requested/i)).toBeInTheDocument();
    expect(screen.getByText(/Download export/i)).toHaveAttribute('href', 'https://example.com/export.zip');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request deletion/i }));
    });
    expect(screen.getByText(/Pending/i)).toBeInTheDocument();
  });

  test('shows export error', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Export failed' } }
    });

    render(<PrivacyPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request export/i }));
    });

    expect(await screen.findByText(/Export failed/i)).toBeInTheDocument();
  });

  test('shows deletion error', async () => {
    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({ data: { export: { downloadUrl: null } } })
      .mockRejectedValueOnce({
        response: { data: { message: 'Deletion failed' } }
      });

    render(<PrivacyPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request export/i }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request deletion/i }));
    });

    expect(await screen.findByText(/Deletion failed/i)).toBeInTheDocument();
  });
});
