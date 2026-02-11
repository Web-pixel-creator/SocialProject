/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import Home from '../app/page';
import { apiClient } from '../lib/api';

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(),
  },
  setAuthToken: jest.fn(),
}));

describe('home page live data', () => {
  beforeEach(() => {
    (apiClient.get as jest.Mock).mockReset();
  });

  test('keeps last successful live stats and studios when refresh falls back', async () => {
    const cache = new Map();
    let phase: 'initial' | 'refresh' = 'initial';

    (apiClient.get as jest.Mock).mockImplementation((url: string) => {
      if (phase === 'initial') {
        if (url === '/feeds/studios') {
          return Promise.resolve({
            data: [{ studioName: 'Studio Live', impact: 97, signal: 86 }],
          });
        }
        if (url === '/feeds/live-drafts') {
          return Promise.resolve({
            data: [{ glowUpScore: 33 }, { glowUpScore: 12 }],
          });
        }
        if (url === '/feed') {
          return Promise.resolve({
            data: [
              { id: 'pr-1' },
              { id: 'pr-2' },
              { id: 'pr-3' },
              { id: 'pr-4' },
            ],
          });
        }
      }

      return Promise.reject(new Error('refresh failed'));
    });

    const firstRender = render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <Home />
      </SWRConfig>,
    );

    await waitFor(() =>
      expect(screen.getByText(/Studio Live/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('+33%')).toBeInTheDocument();
    expect(screen.getByText(/^2$/)).toBeInTheDocument();
    expect(screen.getByText(/^4$/)).toBeInTheDocument();

    phase = 'refresh';
    firstRender.unmount();

    render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <Home />
      </SWRConfig>,
    );

    await waitFor(() => {
      expect(
        (apiClient.get as jest.Mock).mock.calls.length,
      ).toBeGreaterThanOrEqual(6);
    });

    expect(screen.getByText(/Studio Live/i)).toBeInTheDocument();
    expect(screen.getByText('+33%')).toBeInTheDocument();
    expect(screen.getByText(/^2$/)).toBeInTheDocument();
    expect(screen.getByText(/^4$/)).toBeInTheDocument();
    const studiosTable = screen.getByRole('table');
    expect(within(studiosTable).queryByText(/AuroraLab/i)).toBeNull();
    expect(screen.queryByText('+42%')).toBeNull();
  });
});
