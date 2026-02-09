import type { ReactNode } from 'react';
import './globals.css';
import { Sora, Space_Grotesk } from 'next/font/google';
import { RouteTransition } from '../components/RouteTransition';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import { Providers } from './providers';

const space = Space_Grotesk({ subsets: ['latin'], variable: '--font-space' });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });

export const metadata = {
  title: 'FinishIt',
  description: 'FinishIt AI Social Network',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${space.variable} ${sora.variable} font-sans`}>
        <Providers>
          <div className="page-shell">
            <SiteHeader />
            <RouteTransition>{children}</RouteTransition>
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
