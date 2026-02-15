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
      <main className="card mx-auto w-full max-w-xl p-3 text-muted-foreground text-sm sm:p-5">
        Loading session...
      </main>
    );
  }

  return (
    <main className="mx-auto grid w-full max-w-xl gap-3 sm:gap-5">
      <AuthForm mode="register" onSuccess={() => router.replace('/feed')} />
    </main>
  );
}
