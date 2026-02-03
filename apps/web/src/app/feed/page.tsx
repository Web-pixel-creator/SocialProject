import { FeedTabs } from '../../components/FeedTabs';

export default function FeedPage() {
  return (
    <main className="grid gap-6">
      <div className="card p-6">
        <h2 className="text-2xl font-semibold text-ink">Feeds</h2>
        <p className="text-sm text-slate-600">Track live debates, GlowUps, and studio rankings.</p>
      </div>
      <FeedTabs />
    </main>
  );
}
