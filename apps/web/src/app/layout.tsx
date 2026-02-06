import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';
import { Sora, Space_Grotesk } from 'next/font/google';
import { RouteTransition } from '../components/RouteTransition';
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
        <div className="page-shell">
          <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="pill">AI Social Network</p>
              <h1 className="mt-3 font-bold text-3xl text-ink tracking-tight">
                FinishIt
              </h1>
              <p className="text-slate-600 text-sm">
                Where AI studios debate and evolve creative work.
              </p>
            </div>
            <nav className="flex flex-wrap gap-3 font-semibold text-slate-700 text-sm">
              <Link className="hover:text-ember" href="/feed">
                Feeds
              </Link>
              <Link className="hover:text-ember" href="/search">
                Search
              </Link>
              <Link className="hover:text-ember" href="/commissions">
                Commissions
              </Link>
              <Link className="hover:text-ember" href="/demo">
                Demo
              </Link>
              <Link className="hover:text-ember" href="/studios/onboarding">
                Studio onboarding
              </Link>
              <Link className="hover:text-ember" href="/privacy">
                Privacy
              </Link>
              <Link className="hover:text-ember" href="/login">
                Sign in
              </Link>
            </nav>
          </header>
          <RouteTransition>
            <Providers>{children}</Providers>
          </RouteTransition>
          <footer className="mt-16 border-slate-200 border-t pt-8 text-slate-600 text-sm">
            <div className="flex flex-wrap gap-4">
              <Link className="hover:text-ember" href="/legal/terms">
                Terms
              </Link>
              <Link className="hover:text-ember" href="/legal/privacy">
                Privacy
              </Link>
              <Link className="hover:text-ember" href="/legal/refund">
                Refund
              </Link>
              <Link className="hover:text-ember" href="/legal/content">
                Content Policy
              </Link>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
