/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SiteHeader } from '../components/SiteHeader';

const pushMock = jest.fn();
let pathnameMock = '/feed';

jest.mock('next/navigation', () => ({
  usePathname: () => pathnameMock,
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    loading: false,
    user: null,
    logout: jest.fn(),
  }),
}));

jest.mock('../components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher">Language</div>,
}));

jest.mock('../components/mode-toggle', () => ({
  ModeToggle: () => <button type="button">Theme</button>,
}));

describe('SiteHeader', () => {
  beforeEach(() => {
    pushMock.mockReset();
    pathnameMock = '/feed';
    window.history.pushState({}, '', '/');
  });

  test('hides header search on feed page to avoid duplicate search controls', () => {
    render(<SiteHeader />);

    expect(
      screen.queryByRole('searchbox', {
        name: /Search \(text \+ visual\)/i,
      }),
    ).toBeNull();
  });

  test('submits header search query and navigates to search page from non-feed pages', () => {
    pathnameMock = '/privacy';
    render(<SiteHeader />);

    const searchInput = screen.getByRole('searchbox', {
      name: /Search \(text \+ visual\)/i,
    });
    fireEvent.change(searchInput, { target: { value: 'visual search' } });
    fireEvent.submit(searchInput.closest('form') as HTMLFormElement);

    const [nextUrl] = pushMock.mock.calls.at(-1) as [string];
    const [nextPath, query = ''] = nextUrl.split('?');
    const params = new URLSearchParams(query);
    expect(nextPath).toBe('/search');
    expect(params.get('mode')).toBe('text');
    expect(params.get('q')).toBe('visual search');
  });

  test('clears desktop header search query with Escape', () => {
    pathnameMock = '/privacy';
    render(<SiteHeader />);

    const searchInput = screen.getByRole('searchbox', {
      name: /Search \(text \+ visual\)/i,
    });
    fireEvent.change(searchInput, { target: { value: 'observer stream' } });
    expect(searchInput).toHaveValue('observer stream');

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).toHaveValue('');
  });

  test('clears desktop header search query with clear button', () => {
    pathnameMock = '/privacy';
    render(<SiteHeader />);

    const searchInput = screen.getByRole('searchbox', {
      name: /Search \(text \+ visual\)/i,
    });
    fireEvent.change(searchInput, { target: { value: 'hot drafts' } });
    expect(searchInput).toHaveValue('hot drafts');

    fireEvent.click(screen.getByRole('button', { name: /Clear search/i }));
    expect(searchInput).toHaveValue('');
  });

  test('prefills header search input from search query params on /search', async () => {
    pathnameMock = '/search';
    window.history.pushState({}, '', '/search?mode=text&q=GlowUp');

    render(<SiteHeader />);

    await waitFor(() => {
      expect(
        screen.getByRole('searchbox', {
          name: /Search \(text \+ visual\)/i,
        }),
      ).toHaveValue('GlowUp');
    });
  });

  test('does not render feed search input in header even when feed query has q', async () => {
    pathnameMock = '/feed';
    window.history.pushState({}, '', '/feed?tab=All&q=observer');

    render(<SiteHeader />);

    await waitFor(() => {
      expect(
        screen.queryByRole('searchbox', {
          name: /Search \(text \+ visual\)/i,
        }),
      ).toBeNull();
    });
  });
});
