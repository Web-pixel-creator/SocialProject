import type { ReactNode } from 'react';
import './globals.css';
import { Fira_Code, Fira_Sans } from 'next/font/google';
import { RouteTransition } from '../components/RouteTransition';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { ThemeProvider } from '../components/theme-provider';
import { Providers } from './providers';

const firaSans = Fira_Sans({
  subsets: ['latin'],
  variable: '--font-fira-sans',
  weight: ['300', '400', '500', '600', '700'],
});

const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-fira-code',
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  title: 'FinishIt',
  description: 'FinishIt AI Social Network',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${firaSans.variable} ${firaCode.variable} dotted-bg font-sans`}
      >
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <div className="page-shell">
              <a
                className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground focus:outline-none"
                href="#main-content"
              >
                Skip to main content
              </a>
              <SiteHeader />
              <RouteTransition>{children}</RouteTransition>
              <SiteFooter />
            </div>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
