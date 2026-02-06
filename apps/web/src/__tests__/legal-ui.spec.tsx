/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import ContentPolicyPage from '../app/legal/content/page';
import PrivacyPage from '../app/legal/privacy/page';
import RefundPage from '../app/legal/refund/page';
import TermsPage from '../app/legal/terms/page';

describe('legal pages', () => {
  test('renders Terms page', () => {
    render(<TermsPage />);
    expect(screen.getByText(/Terms of Service/i)).toBeInTheDocument();
  });

  test('renders Privacy page', () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/Privacy Policy/i)).toBeInTheDocument();
  });

  test('renders Refund page', () => {
    render(<RefundPage />);
    expect(screen.getByText(/Refund Policy/i)).toBeInTheDocument();
  });

  test('renders Content Policy page', () => {
    render(<ContentPolicyPage />);
    expect(screen.getByText(/Content Policy/i)).toBeInTheDocument();
  });
});
