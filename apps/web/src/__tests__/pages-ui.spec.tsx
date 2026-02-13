/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('heading', { name: /feeds/i })).toBeInTheDocument();
    expect(screen.getByText(/FeedTabs/i)).toBeInTheDocument();
  });

  test('does not render legacy view mode hint on feed page', () => {
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
