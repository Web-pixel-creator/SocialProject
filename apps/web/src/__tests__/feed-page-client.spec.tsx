/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FeedPageClient from '../components/FeedPageClient';
import { apiClient } from '../lib/api';

jest.mock('../components/FeedTabs', () => ({
  FeedTabs: ({ isObserverMode }: { isObserverMode: boolean }) => (
    <div data-testid="feed-tabs">{isObserverMode ? 'observer' : 'focus'}</div>
  ),
}));

jest.mock('../components/ObserverRightRail', () => ({
  ObserverRightRail: () => (
    <aside data-testid="observer-right-rail">Rail</aside>
  ),
}));

jest.mock('../components/ObserverSidebar', () => ({
  ObserverSidebar: () => <aside data-testid="observer-sidebar">Sidebar</aside>,
}));

jest.mock('../components/PanelErrorBoundary', () => ({
  PanelErrorBoundary: ({ children }: { children: unknown }) => <>{children}</>,
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

describe('FeedPageClient', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (apiClient.post as jest.Mock).mockClear();
  });

  test('toggles observer and focus mode with animated rail shell classes', () => {
    render(<FeedPageClient />);

    const pageMain = screen.getByRole('main');
    const rightRailShell = screen.getByTestId('feed-right-rail-shell');

    expect(pageMain).not.toHaveClass('feed-shell-focus');
    expect(rightRailShell).toHaveClass('observer-right-rail-shell-open');
    expect(screen.getByTestId('feed-tabs')).toHaveTextContent('observer');

    fireEvent.click(screen.getByRole('button', { name: /^Focus mode$/i }));

    expect(pageMain).toHaveClass('feed-shell-focus');
    expect(rightRailShell).toHaveClass('observer-right-rail-shell-collapsed');
    expect(screen.getByTestId('feed-tabs')).toHaveTextContent('focus');
    expect(window.localStorage.getItem('finishit-feed-view-mode')).toBe(
      'focus',
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_view_mode_change',
        mode: 'focus',
        previousMode: 'observer',
        source: 'header',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^Observer mode$/i }));

    expect(pageMain).not.toHaveClass('feed-shell-focus');
    expect(rightRailShell).toHaveClass('observer-right-rail-shell-open');
    expect(screen.getByTestId('feed-tabs')).toHaveTextContent('observer');
    expect(window.localStorage.getItem('finishit-feed-view-mode')).toBe(
      'observer',
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_view_mode_change',
        mode: 'observer',
        previousMode: 'focus',
        source: 'header',
      }),
    );
  });

  test('lets user pick mode from onboarding hint and saves choice', async () => {
    render(<FeedPageClient />);

    expect(screen.getByText(/Choose your feed mode/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Switch to focus/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Choose your feed mode/i)).toBeNull();
    });

    expect(window.localStorage.getItem('finishit-feed-view-hint-seen')).toBe(
      '1',
    );
    expect(window.localStorage.getItem('finishit-feed-view-mode')).toBe(
      'focus',
    );
    expect(screen.getByTestId('feed-tabs')).toHaveTextContent('focus');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_view_mode_change',
        mode: 'focus',
        previousMode: 'observer',
        source: 'hint',
      }),
    );
  });

  test('tracks hint dismiss event without mode switch', async () => {
    render(<FeedPageClient />);

    fireEvent.click(
      screen.getByRole('button', { name: /^(Got it|Dismiss)$/i }),
    );

    await waitFor(() =>
      expect(screen.queryByText(/Choose your feed mode/i)).toBeNull(),
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/telemetry/ux',
      expect.objectContaining({
        eventType: 'feed_view_mode_hint_dismiss',
        mode: 'observer',
      }),
    );
  });
});
