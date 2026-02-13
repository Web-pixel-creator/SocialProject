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
    expect(rightRailShell).toHaveClass('observer-right-rail-shell-open');
    expect(screen.getByTestId('feed-tabs')).toHaveTextContent('observer');
    expect(
      screen.queryByRole('button', { name: /^Focus mode$/i }),
    ).not.toBeInTheDocument();
  });

  test('opens and closes mobile observer navigation dialog', async () => {
    render(<FeedPageClient />);

    fireEvent.click(screen.getByRole('button', { name: /menu/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
