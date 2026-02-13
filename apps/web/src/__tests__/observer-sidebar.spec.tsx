/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ObserverSidebar } from '../components/ObserverSidebar';

jest.mock('next/navigation', () => ({
  usePathname: () => '/feed',
  useSearchParams: () => new URLSearchParams(''),
}));

describe('ObserverSidebar', () => {
  const originalAdminUxLinkFlag = process.env.NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK;

  afterEach(() => {
    if (originalAdminUxLinkFlag === undefined) {
      Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK');
    } else {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK = originalAdminUxLinkFlag;
    }
  });

  test('hides Admin UX link when feature flag is disabled', () => {
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK = 'false';

    render(<ObserverSidebar />);

    expect(
      screen.queryByRole('link', {
        name: /Admin UX/i,
      }),
    ).toBeNull();
  });

  test('shows Admin UX link when feature flag is enabled', () => {
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK = 'true';

    render(<ObserverSidebar />);

    expect(
      screen.getByRole('link', {
        name: /Admin UX/i,
      }),
    ).toHaveAttribute('href', '/admin/ux');
  });
});
