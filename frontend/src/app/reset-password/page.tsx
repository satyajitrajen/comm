'use client';

import { FormEvent, Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Lock } from 'lucide-react';
import { authAPI } from '../../services/api';
import PasswordInput from '../components/PasswordInput';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authAPI.resetPassword({ token, password });
      // Every session was revoked server-side, so signing in again is required.
      router.replace('/login?notice=password-updated');
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setError(message || 'That reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Link not valid</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This page needs a reset link from your email. Reset links expire after 30 minutes and can
          only be used once.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-800"
        >
          Request a new link
        </Link>
      </section>
    );
  }

  return (
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-950">Choose a new password</h1>
      <p className="mt-2 text-sm text-slate-500">
        You will be signed out everywhere and need to sign in again.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          New password
          <PasswordInput
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="text-sm"
            autoComplete="new-password"
            required
            leading={<Lock className="h-4 w-4 shrink-0 text-slate-400" />}
            frameClassName="mt-1.5 h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters.</span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Confirm new password
          <PasswordInput
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="text-sm"
            autoComplete="new-password"
            required
            leading={<Lock className="h-4 w-4 shrink-0 text-slate-400" />}
            frameClassName="mt-1.5 h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white"
          />
        </label>

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
        >
          {loading ? 'Updating...' : 'Update password'}
          <KeyRound className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950">
      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={<div className="text-sm text-slate-400">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
