'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { authAPI } from '../../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      await authAPI.forgotPassword(email.trim());
    } catch {
      // Deliberately ignored: the server answers identically for unknown
      // addresses, and surfacing a failure here would leak that distinction.
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </Link>

        {sent ? (
          <>
            <h1 className="text-2xl font-bold text-slate-950">Check your email</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              If <span className="font-medium text-slate-900">{email.trim()}</span> has an account,
              a link to choose a new password is on its way. It expires in 30 minutes.
            </p>
            <p className="mt-4 text-sm text-slate-500">
              Nothing arrived? Check spam, or{' '}
              <button
                type="button"
                onClick={() => setSent(false)}
                className="font-semibold text-blue-700 hover:text-blue-900"
              >
                try a different address
              </button>
              .
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-950">Forgot your password?</h1>
            <p className="mt-2 text-sm text-slate-500">
              Enter your work email and we&apos;ll send you a reset link.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

              <button
                type="submit"
                disabled={loading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send reset link'}
                <Send className="h-4 w-4" />
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
