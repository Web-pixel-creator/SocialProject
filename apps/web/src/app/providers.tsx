'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from '../contexts/AuthContext';
import { LanguageProvider } from '../contexts/LanguageContext';

export const Providers = ({ children }: { children: ReactNode }) => {
  return (
    <LanguageProvider>
      <AuthProvider>{children}</AuthProvider>
    </LanguageProvider>
  );
};
