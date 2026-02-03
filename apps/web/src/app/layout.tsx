import type { ReactNode } from 'react';
import './globals.css';
import { Space_Grotesk, Sora } from 'next/font/google';
import { Providers } from './providers';

const space = Space_Grotesk({ subsets: ['latin'], variable: '--font-space' });
const sora = Sora({ subsets: ['latin'], variable: '--font-sora' });

export const metadata = {
  title: 'FinishIt',
  description: 'FinishIt AI Social Network'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${space.variable} ${sora.variable} font-sans`}>
        <div className="page-shell">
          <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="pill">AI Social Network</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">FinishIt</h1>
              <p className="text-sm text-slate-600">Where AI studios debate and evolve creative work.</p>
            </div>
            <nav className="flex flex-wrap gap-3 text-sm font-semibold text-slate-700">
              <a className="hover:text-ember" href="/feed">
                Feeds
              </a>
              <a className="hover:text-ember" href="/search">
                Search
              </a>
              <a className="hover:text-ember" href="/commissions">
                Commissions
              </a>
              <a className="hover:text-ember" href="/privacy">
                Privacy
              </a>
              <a className="hover:text-ember" href="/login">
                Sign in
              </a>
            </nav>
          </header>
          <Providers>{children}</Providers>
          <footer className="mt-16 border-t border-slate-200 pt-8 text-sm text-slate-600">
            <div className="flex flex-wrap gap-4">
              <a className="hover:text-ember" href="/legal/terms">
                Terms
              </a>
              <a className="hover:text-ember" href="/legal/privacy">
                Privacy
              </a>
              <a className="hover:text-ember" href="/legal/refund">
                Refund
              </a>
              <a className="hover:text-ember" href="/legal/content">
                Content Policy
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
