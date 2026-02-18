/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FeedPageClient from '../components/FeedPageClient';

jest.mock('../components/FeedTabs', () => ({
  FeedTabs: () => <div data-testid="feed-tabs">observer</div>,
}));

jest.mock('../components/ObserverRightRail', () => ({
  ObserverRightRail: () => (
    <aside data-testid="observer-right-rail">Rail</aside>
  ),
}));

jest.mock('../components/SwarmSessionsRail', () => ({
  SwarmSessionsRail: () => (
    <aside data-testid="swarm-sessions-rail">Swarms</aside>
  ),
}));

jest.mock('../components/LiveStudioSessionsRail', () => ({
  LiveStudioSessionsRail: () => (
    <aside data-testid="live-studio-sessions-rail">Live sessions</aside>
  ),
}));

jest.mock('../components/ObserverSidebar', () => ({
  ObserverSidebar: ({
    mobile,
    onNavigate,
  }: {
    mobile?: boolean;
    onNavigate?: () => void;
  }) => (
    <aside
      data-testid={mobile ? 'observer-sidebar-mobile' : 'observer-sidebar'}
    >
      Sidebar
      {mobile ? (
        <button onClick={onNavigate} type="button">
          Navigate
        </button>
      ) : null}
    </aside>
  ),
}));

jest.mock('../components/PanelErrorBoundary', () => ({
  PanelErrorBoundary: ({ children }: { children: unknown }) => <>{children}</>,
}));

describe('FeedPageClient', () => {
  test('renders observer mode layout without focus mode toggle', () => {
    render(<FeedPageClient />);

    const pageMain = screen.getByRole('main');
    const rightRailShell = screen.getByTestId('feed-right-rail-shell');

    expect(pageMain).not.toHaveClass('feed-shell-focus');
    expect(rightRailShell).toHaveClass('observer-right-rail-shell');
    expect(screen.getByTestId('feed-tabs')).toHaveTextContent('observer');
    expect(screen.getByTestId('live-studio-sessions-rail')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Focus mode$/i }),
    ).not.toBeInTheDocument();
  });

  test('opens and closes mobile observer navigation dialog', async () => {
    render(<FeedPageClient />);

    const menuButton = screen.getByRole('button', { name: /menu/i });
    expect(menuButton).toHaveAttribute(
      'aria-controls',
      'feed-mobile-observer-nav',
    );
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: /observer navigation/i }),
    ).toHaveAttribute('id', 'feed-mobile-observer-nav');

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
