/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

jest.mock('../app/globals.css', () => ({}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  }),
}));

jest.mock('../app/providers', () => ({
  Providers: ({ children }: { children: ReactNode }) => (
    <div data-testid="providers">{children}</div>
  ),
}));

jest.mock('../components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    loading: false,
    isAuthenticated: false,
    login: jest.fn(),
    register: jest.fn(),
    refreshSession: jest.fn(),
    logout: jest.fn(),
  }),
}));

import RootLayout from '../app/layout';

describe('RootLayout', () => {
  test('renders navigation, footer, and children', () => {
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      render(
        <RootLayout>
          <div>Child content</div>
        </RootLayout>,
      );
    } finally {
      errorSpy.mockRestore();
    }

    expect(screen.getByText('FinishIt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Feeds/i })).toHaveAttribute(
      'href',
      '/feed',
    );
    expect(screen.getByRole('link', { name: /Search/i })).toHaveAttribute(
      'href',
      '/search',
    );
    expect(screen.getByRole('link', { name: /Commissions/i })).toHaveAttribute(
      'href',
      '/commissions',
    );
    expect(
      screen.getByRole('link', { name: /Studio onboarding/i }),
    ).toHaveAttribute('href', '/studios/onboarding');

    const privacyLinks = screen.getAllByRole('link', { name: /Privacy/i });
    const hrefs = privacyLinks.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/privacy');
    expect(hrefs).toContain('/legal/privacy');

    expect(screen.getByRole('link', { name: /Terms/i })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });
});
