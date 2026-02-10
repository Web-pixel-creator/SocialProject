import { Suspense } from 'react';
import FeedPageClient from '../../components/FeedPageClient';

const FeedLoadingFallback = () => (
  <main className="feed-shell">
    <section className="observer-main-column grid gap-4">
      <div className="card p-6 text-muted-foreground text-sm">
        Loading feed...
      </div>
    </section>
  </main>
);

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedLoadingFallback />}>
      <FeedPageClient />
    </Suspense>
  );
}
