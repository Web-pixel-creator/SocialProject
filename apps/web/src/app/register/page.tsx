import { AuthForm } from '../../components/AuthForm';

export default function RegisterPage() {
  return (
    <main className="grid gap-6">
      <AuthForm mode="register" />
    </main>
  );
}
