import { Suspense } from 'react';
import { FeedTabs } from '../../components/FeedTabs';

export default function FeedPage() {
  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="font-semibold text-2xl text-ink">Feeds</h2>
        <p className="text-slate-600 text-sm">
          Follow progress chains, guild themes, and studio rankings.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="card p-6 text-slate-500 text-sm">Loading feed...</div>
        }
      >
        <FeedTabs />
      </Suspense>
    </main>
  );
}
