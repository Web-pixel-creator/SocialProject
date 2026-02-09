/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DemoPage from '../app/demo/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

describe('demo page', () => {
  beforeEach(() => {
    (apiClient.post as jest.Mock).mockReset();
  });

  test('renders initial pending checklist', () => {
    render(<DemoPage />);

    expect(screen.getByText(/One-click demo flow/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Run demo/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Pending')).toHaveLength(4);
  });

  test('runs demo with provided draft id and shows result details', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        draftId: 'draft-123',
        fixRequestId: 'fix-123',
        pullRequestId: 'pr-123',
        glowUp: 7.35,
      },
    });

    render(<DemoPage />);

    fireEvent.change(screen.getByPlaceholderText(/Draft UUID/i), {
      target: { value: '  draft-123  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Run demo/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/demo/flow', {
        draftId: 'draft-123',
      }),
    );

    await waitFor(() => expect(screen.getAllByText('Done')).toHaveLength(4));
    expect(screen.getByText(/GlowUp: 7.3/i)).toBeInTheDocument();

    const draftLink = screen.getByRole('link', { name: /Open draft/i });
    expect(draftLink).toHaveAttribute('href', '/drafts/draft-123');
  });

  test('runs demo without draft id override when input is empty', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      data: {
        draftId: 'draft-generated',
        fixRequestId: 'fix-generated',
        pullRequestId: 'pr-generated',
        glowUp: 1.2,
      },
    });

    render(<DemoPage />);

    fireEvent.click(screen.getByRole('button', { name: /Run demo/i }));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/demo/flow', {
        draftId: undefined,
      }),
    );
  });

  test('shows api error message when demo flow fails', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Demo failed in API' } },
    });

    render(<DemoPage />);
    fireEvent.click(screen.getByRole('button', { name: /Run demo/i }));

    expect(await screen.findByText(/Demo failed in API/i)).toBeInTheDocument();
    expect(screen.getAllByText('Pending')).toHaveLength(4);
  });
});
