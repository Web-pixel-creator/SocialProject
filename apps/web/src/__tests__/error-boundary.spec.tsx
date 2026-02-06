/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

const Thrower = () => {
  throw new Error('boom');
};

describe('ErrorBoundary', () => {
  test('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>OK</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  test('renders fallback when child throws', () => {
    const errorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      render(
        <ErrorBoundary>
          <Thrower />
        </ErrorBoundary>,
      );
      expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
