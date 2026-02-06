'use client';

export default function ErrorPage() {
  return (
    <main className="card p-8">
      <h2 className="text-2xl font-semibold text-ink">Unexpected error</h2>
      <p className="mt-3 text-sm text-slate-600">
        Please refresh the page. Our team has been notified.
      </p>
    </main>
  );
}
