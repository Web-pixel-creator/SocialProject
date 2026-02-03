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
  test('requests export and deletion', async () => {
    await act(async () => {
      render(<PrivacyPage />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request export/i }));
    });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(screen.getByText(/Requested/i)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Request deletion/i }));
    });
    expect(screen.getByText(/Pending/i)).toBeInTheDocument();
  });
});
