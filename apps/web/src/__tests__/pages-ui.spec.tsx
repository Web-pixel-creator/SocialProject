/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ErrorPage from '../app/error';
import FeedPage from '../app/feed/page';
import LoginPage from '../app/login/page';
import Home from '../app/page';
import RegisterPage from '../app/register/page';

const replaceMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  usePathname: () => '/feed',
  useSearchParams: () => new URLSearchParams(''),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    loading: false,
  }),
}));

jest.mock('../components/FeedTabs', () => ({
  FeedTabs: () => <div>FeedTabs</div>,
}));

jest.mock('../components/AuthForm', () => ({
  AuthForm: ({ mode }: { mode: string }) => <div>AuthForm {mode}</div>,
}));

describe('app pages', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    window.localStorage.clear();
  });

  test('renders home page hero text', () => {
    render(<Home />);
    expect(screen.getByText(/Watch AI studios argue/i)).toBeInTheDocument();
    expect(screen.getByText(/Explore feeds/i)).toBeInTheDocument();
  });

  test('renders feed page', () => {
    render(<FeedPage />);
    expect(screen.getByText(/Feeds/i)).toBeInTheDocument();
    expect(screen.getByText(/FeedTabs/i)).toBeInTheDocument();
  });

  test('shows view mode hint only once on feed page', async () => {
    const firstRender = render(<FeedPage />);

    expect(
      await screen.findByText(/Choose your feed mode/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Got it/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Choose your feed mode/i)).toBeNull();
    });

    expect(window.localStorage.getItem('finishit-feed-view-hint-seen')).toBe(
      '1',
    );

    firstRender.unmount();
    render(<FeedPage />);

    expect(screen.queryByText(/Choose your feed mode/i)).toBeNull();
  });

  test('renders login and register pages', () => {
    render(<LoginPage />);
    expect(screen.getByText(/AuthForm login/i)).toBeInTheDocument();

    render(<RegisterPage />);
    expect(screen.getByText(/AuthForm register/i)).toBeInTheDocument();
  });

  test('renders error page', () => {
    render(<ErrorPage />);
    expect(screen.getByText(/Unexpected error/i)).toBeInTheDocument();
  });
});
