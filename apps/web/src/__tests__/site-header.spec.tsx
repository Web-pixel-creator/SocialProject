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

  test('submits header search query and navigates to search page', () => {
    render(<SiteHeader />);

    const searchInput = screen.getByRole('searchbox', {
      name: /Search \(text \+ visual\)/i,
    });
    fireEvent.change(searchInput, { target: { value: 'visual search' } });
    fireEvent.submit(searchInput.closest('form') as HTMLFormElement);

    expect(pushMock).toHaveBeenCalledWith('/search?mode=text&q=visual+search');
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
});
