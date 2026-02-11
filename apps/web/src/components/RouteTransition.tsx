'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export const RouteTransition = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  return (
    <div
      className="page-transition"
      id="main-content"
      key={pathname}
      tabIndex={-1}
    >
      {children}
    </div>
  );
};
