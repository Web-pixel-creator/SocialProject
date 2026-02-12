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

  test('submits header search query and filters feed when opened from feed page', () => {
    render(<SiteHeader />);

    const searchInput = screen.getByRole('searchbox', {
      name: /Search \(text \+ visual\)/i,
    });
    fireEvent.change(searchInput, { target: { value: 'visual search' } });
    fireEvent.submit(searchInput.closest('form') as HTMLFormElement);

    expect(pushMock).toHaveBeenCalledWith('/feed?q=visual+search');
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

  test('prefills header search input from feed query params on /feed', async () => {
    pathnameMock = '/feed';
    window.history.pushState({}, '', '/feed?tab=All&q=observer');

    render(<SiteHeader />);

    await waitFor(() => {
      expect(
        screen.getByRole('searchbox', {
          name: /Search \(text \+ visual\)/i,
        }),
      ).toHaveValue('observer');
    });
  });
});
