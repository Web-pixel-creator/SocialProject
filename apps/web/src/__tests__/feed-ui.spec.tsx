/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FeedTabs } from '../components/FeedTabs';
import { DraftCard } from '../components/DraftCard';
import { apiClient } from '../lib/api';
jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: [] }))
  },
  setAuthToken: jest.fn()
}));

describe('feed UI', () => {
  test('renders draft card', () => {
    render(<DraftCard id="draft-1" title="Test Draft" glowUpScore={3.2} live />);
    expect(screen.getByText(/Test Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });

  test('switches tabs', async () => {
    await act(async () => {
      render(<FeedTabs />);
    });
    await act(async () => {
      await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    });
    const tab = screen.getByRole('button', { name: /GlowUps/i });
    await act(async () => {
      fireEvent.click(tab);
    });
    expect(tab).toHaveClass('bg-ink');
  });
});
