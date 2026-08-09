'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Lock, Mail, Send, User } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import { authAPI, persistAuthTokens } from '../../services/api';

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: {
    id: string;
    email?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    workspaceId?: string | null;
    workspaceName?: string | null;
    workspaceRole?: string | null;
    department?: string | null;
    isAdmin?: boolean;
    canPostAnnouncements?: boolean;
  };
};

function persistSession(session: AuthResponse) {
  persistAuthTokens(session.accessToken, session.refreshToken, session.sessionId);
  localStorage.setItem('veloce_user', JSON.stringify(session.user));
}

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      await authAPI.register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
      });
      const session = await authAPI.login({ email: email.trim(), password });
      persistSession(session);
      router.replace('/home');
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number; data?: { message?: string | string[] } } })?.response;
      const status = response?.status;
      const serverMessage = response?.data?.message;
      const parsedMessage = Array.isArray(serverMessage) ? serverMessage[0] : serverMessage;

      if (status === 403) {
        setError('Registration is invite-only — contact your workspace administrator.');
      } else if (parsedMessage && typeof parsedMessage === 'string' && parsedMessage.trim()) {
        setError(parsedMessage);
      } else if (status === 409) {
        setError('An account with that email already exists. Try signing in instead.');
      } else {
        setError('Could not create account. Check your details and try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-700 text-white">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950">Create your account</h1>
            <p className="text-sm text-slate-500">Join your organization workspace.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Full name
            <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white">
              <User className="h-4 w-4 text-slate-400" />
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                autoComplete="name"
                required
              />
            </span>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Email
            <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white">
              <Mail className="h-4 w-4 text-slate-400" />
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                type="email"
                autoComplete="email"
                required
              />
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Password
              <PasswordInput
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="text-sm"
                autoComplete="new-password"
                minLength={8}
                required
                leading={<Lock className="h-4 w-4 shrink-0 text-slate-400" />}
                frameClassName="mt-1.5 h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white"
              />
            </label>
            <p className="mt-1.5 text-xs text-slate-400">At least 8 characters.</p>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Confirm password
            <PasswordInput
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="text-sm"
              autoComplete="new-password"
              minLength={8}
              required
              leading={<Lock className="h-4 w-4 shrink-0 text-slate-400" />}
              frameClassName="mt-1.5 h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white"
            />
          </label>

          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
            <Send className="h-4 w-4" />
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-blue-700 hover:text-blue-900">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
