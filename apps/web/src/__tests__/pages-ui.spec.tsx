/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import Home from '../app/page';
import FeedPage from '../app/feed/page';
import LoginPage from '../app/login/page';
import RegisterPage from '../app/register/page';
import ErrorPage from '../app/error';

jest.mock('../components/FeedTabs', () => ({
  FeedTabs: () => <div>FeedTabs</div>
}));

jest.mock('../components/AuthForm', () => ({
  AuthForm: ({ mode }: { mode: string }) => <div>AuthForm {mode}</div>
}));

describe('app pages', () => {
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
