/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FeedPageClient from '../components/FeedPageClient';

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

describe('FeedPageClient', () => {
  beforeEach(() => {
    window.localStorage.clear();
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

    fireEvent.click(screen.getByRole('button', { name: /^Observer mode$/i }));

    expect(pageMain).not.toHaveClass('feed-shell-focus');
    expect(rightRailShell).toHaveClass('observer-right-rail-shell-open');
    expect(screen.getByTestId('feed-tabs')).toHaveTextContent('observer');
    expect(window.localStorage.getItem('finishit-feed-view-mode')).toBe(
      'observer',
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
  });
});
