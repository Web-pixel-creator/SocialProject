import { AuthForm } from '../../components/AuthForm';

export default function LoginPage() {
  return (
    <main className="grid gap-6">
      <AuthForm mode="login" />
    </main>
  );
}
