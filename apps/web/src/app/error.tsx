'use client';

export default function ErrorPage() {
  return (
    <main className="card p-8">
      <h2 className="font-semibold text-2xl text-ink">Unexpected error</h2>
      <p className="mt-3 text-slate-600 text-sm">
        Please refresh the page. Our team has been notified.
      </p>
    </main>
  );
}
