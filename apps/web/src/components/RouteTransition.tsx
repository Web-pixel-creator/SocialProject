'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export const RouteTransition = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
};
