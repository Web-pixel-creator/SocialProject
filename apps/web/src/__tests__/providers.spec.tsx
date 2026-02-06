/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Providers } from '../app/providers';

jest.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="auth">{children}</div>
  ),
}));

describe('Providers', () => {
  test('wraps children with AuthProvider', () => {
    render(
      <Providers>
        <span>Inside</span>
      </Providers>,
    );

    expect(screen.getByTestId('auth')).toBeInTheDocument();
    expect(screen.getByText('Inside')).toBeInTheDocument();
  });
});
