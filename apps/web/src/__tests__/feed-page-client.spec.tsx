/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import FeedPageClient from '../components/FeedPageClient';

const RIGHT_RAIL_VIEW_STORAGE_KEY = 'finishit-feed-right-rail-view';

jest.mock('../components/FeedTabs', () => ({
  FeedTabs: () => <div data-testid="feed-tabs">observer</div>,
}));

jest.mock('../components/ObserverRightRail', () => ({
  ObserverRightRail: ({
    onSignalCountChange,
  }: {
    onSignalCountChange?: (count: number) => void;
  }) => {
    useEffect(() => {
      onSignalCountChange?.(9);
    }, [onSignalCountChange]);
    return <aside data-testid="observer-right-rail">Rail</aside>;
  },
}));

jest.mock('../components/SwarmSessionsRail', () => ({
  SwarmSessionsRail: ({
    onSessionCountChange,
  }: {
    onSessionCountChange?: (count: number) => void;
  }) => {
    useEffect(() => {
      onSessionCountChange?.(3);
    }, [onSessionCountChange]);
    return <aside data-testid="swarm-sessions-rail">Swarms</aside>;
  },
}));

jest.mock('../components/LiveStudioSessionsRail', () => ({
  LiveStudioSessionsRail: ({
    onSessionCountChange,
  }: {
    onSessionCountChange?: (count: number) => void;
  }) => {
    useEffect(() => {
      onSessionCountChange?.(7);
    }, [onSessionCountChange]);
    return <aside data-testid="live-studio-sessions-rail">Live sessions</aside>;
  },
}));

jest.mock('../components/CreatorStudiosRail', () => ({
  CreatorStudiosRail: ({
    onStudioCountChange,
  }: {
    onStudioCountChange?: (count: number) => void;
  }) => {
    useEffect(() => {
      onStudioCountChange?.(2);
    }, [onStudioCountChange]);
    return <aside data-testid="creator-studios-rail">Creator</aside>;
  },
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
  beforeEach(() => {
    window.localStorage.removeItem(RIGHT_RAIL_VIEW_STORAGE_KEY);
  });

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

  test('switches right rail sections with tab controls', async () => {
    render(<FeedPageClient />);

    expect(screen.getByTestId('live-studio-sessions-rail')).toBeInTheDocument();
    expect(screen.queryByTestId('swarm-sessions-rail')).toBeNull();
    expect(screen.queryByTestId('observer-right-rail')).toBeNull();

    fireEvent.click(screen.getByTestId('feed-right-rail-tab-studio'));
    expect(screen.getByTestId('feed-right-rail-skeleton')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('swarm-sessions-rail')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('live-studio-sessions-rail')).toBeNull();
    expect(screen.queryByTestId('observer-right-rail')).toBeNull();
    expect(window.localStorage.getItem(RIGHT_RAIL_VIEW_STORAGE_KEY)).toBe(
      'studio',
    );

    fireEvent.click(screen.getByTestId('feed-right-rail-tab-radar'));
    expect(screen.getByTestId('feed-right-rail-skeleton')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('observer-right-rail')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('live-studio-sessions-rail')).toBeNull();
    expect(screen.queryByTestId('swarm-sessions-rail')).toBeNull();
    expect(window.localStorage.getItem(RIGHT_RAIL_VIEW_STORAGE_KEY)).toBe(
      'radar',
    );
  });

  test('updates right rail tab count badges from section callbacks', async () => {
    render(<FeedPageClient />);

    await waitFor(() => {
      expect(
        screen.getByTestId('feed-right-rail-count-live'),
      ).toHaveTextContent('7');
    });

    fireEvent.click(screen.getByTestId('feed-right-rail-tab-studio'));
    await waitFor(() => {
      expect(screen.getByTestId('creator-studios-rail')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('feed-right-rail-count-studio'),
    ).toHaveTextContent('5');

    fireEvent.click(screen.getByTestId('feed-right-rail-tab-radar'));
    await waitFor(() => {
      expect(screen.getByTestId('observer-right-rail')).toBeInTheDocument();
    });
    expect(screen.getByTestId('feed-right-rail-count-radar')).toHaveTextContent(
      '9',
    );
  });

  test('supports keyboard navigation for right rail tabs', async () => {
    render(<FeedPageClient />);

    const liveTab = screen.getByTestId('feed-right-rail-tab-live');
    const studioTab = screen.getByTestId('feed-right-rail-tab-studio');
    const radarTab = screen.getByTestId('feed-right-rail-tab-radar');

    liveTab.focus();
    expect(liveTab).toHaveFocus();
    expect(liveTab).toHaveAttribute('aria-selected', 'true');
    expect(studioTab).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(liveTab, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(screen.getByTestId('swarm-sessions-rail')).toBeInTheDocument();
    });
    expect(studioTab).toHaveFocus();
    expect(studioTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(studioTab, { key: 'End' });
    await waitFor(() => {
      expect(screen.getByTestId('observer-right-rail')).toBeInTheDocument();
    });
    expect(radarTab).toHaveFocus();
    expect(radarTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(radarTab, { key: 'Home' });
    await waitFor(() => {
      expect(
        screen.getByTestId('live-studio-sessions-rail'),
      ).toBeInTheDocument();
    });
    expect(liveTab).toHaveFocus();
    expect(liveTab).toHaveAttribute('aria-selected', 'true');
  });

  test('restores right rail tab from localStorage on mount', async () => {
    window.localStorage.setItem(RIGHT_RAIL_VIEW_STORAGE_KEY, 'radar');

    render(<FeedPageClient />);

    await waitFor(() => {
      expect(screen.getByTestId('observer-right-rail')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('live-studio-sessions-rail')).toBeNull();
    expect(screen.queryByTestId('swarm-sessions-rail')).toBeNull();
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
