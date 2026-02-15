'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthForm } from '../../components/AuthForm';
import { useAuth } from '../../contexts/AuthContext';

export default function RegisterPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace('/feed');
    }
  }, [isAuthenticated, loading, router]);

  if (loading || isAuthenticated) {
    return (
      <main className="card mx-auto w-full max-w-xl p-6 text-muted-foreground text-sm">
        Loading session...
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-xl gap-6">
      <AuthForm mode="register" onSuccess={() => router.replace('/feed')} />
    </main>
  );
}
