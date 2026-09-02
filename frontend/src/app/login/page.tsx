'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Lock, Mail, MessageSquare, Send, Shield } from 'lucide-react';
import { authAPI, persistAuthTokens } from '../../services/api';
import PasswordInput from '../components/PasswordInput';

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

type TwoFactorChallenge = {
  needsTwoFactor: true;
  verifyKey: string;
  maskedDestination: string;
};

function isTwoFactorChallenge(data: unknown): data is TwoFactorChallenge {
  return (
    typeof data === 'object' &&
    data !== null &&
    'needsTwoFactor' in data &&
    (data as { needsTwoFactor?: boolean }).needsTwoFactor === true
  );
}

function persistSession(session: AuthResponse) {
  persistAuthTokens(session.accessToken, session.refreshToken, session.sessionId);
  localStorage.setItem('veloce_user', JSON.stringify(session.user));
}

/** Only same-origin relative paths may be used as a post-login destination. */
function safeNextPath(next: string | null): string {
  if (!next) return '/home';
  if (!next.startsWith('/') || next.startsWith('//')) return '/home';
  if (next.includes('://') || /^[a-z][a-z0-9+.-]*:/i.test(next)) return '/home';
  return next;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'password' | 'otp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [twoFaVerifyKey, setTwoFaVerifyKey] = useState('');
  const [twoFaHint, setTwoFaHint] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('notice') === 'password-updated') {
      setNotice('Password updated — please sign in with your new password.');
    }
  }, []);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const result = await authAPI.login({ email: email.trim(), password });
      if (isTwoFactorChallenge(result)) {
        setTwoFaVerifyKey(result.verifyKey);
        setTwoFaHint(result.maskedDestination);
        setOtpCode('');
        setStep('otp');
        return;
      }
      persistSession(result as AuthResponse);
      const params = new URLSearchParams(window.location.search);
      router.replace(safeNextPath(params.get('next')));
    } catch {
      setError('Check your email and password, then try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const session = await authAPI.verifyTwoFactor({
        verifyKey: twoFaVerifyKey,
        otpCode: otpCode.replace(/\s/g, ''),
      });
      persistSession(session as AuthResponse);
      const params = new URLSearchParams(window.location.search);
      router.replace(safeNextPath(params.get('next')));
    } catch {
      setError('That code is incorrect or has expired. Try again or go back and sign in again.');
    } finally {
      setLoading(false);
    }
  }

  function goBackToPassword() {
    setStep('password');
    setOtpCode('');
    setTwoFaVerifyKey('');
    setTwoFaHint('');
    setError('');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-950">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex min-h-[560px] flex-col justify-between bg-[#08214a] p-8 text-white">
          <div className="flex items-center gap-3">
            <img
              src="/teamtime-favicon.png"
              alt="TeamTime logo"
              className="h-14 w-14 rounded-xl object-contain"
            />
            <div>
              <div className="text-base font-semibold">TeamTime</div>
              <div className="text-sm text-blue-100">Team communication workspace</div>
            </div>
          </div>

          <div className="max-w-md">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-50">
              <MessageSquare className="h-3.5 w-3.5" />
              Cross-team launch operations
            </div>
            <h1 className="text-3xl font-bold leading-tight">
              One shared workspace for messaging, huddles, and approvals.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-blue-100">
              Coordinate across your department or bring the whole workspace together in high-clarity channels.
            </p>
          </div>

          <div className="text-xs text-blue-200">
            Protected by enterprise-grade token rotation and per-workspace permission controls.
          </div>
        </div>

        <div className="flex flex-col justify-center p-8 lg:p-12">
          {step === 'password' ? (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-950">Sign in to TeamTime</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter your workspace email and password to access your team.
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      autoComplete="username"
                      placeholder="you@company.com"
                      required
                    />
                  </span>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Password
                  <PasswordInput
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="text-sm"
                    autoComplete="current-password"
                    required
                    leading={<Lock className="h-4 w-4 shrink-0 text-slate-400" />}
                    frameClassName="mt-1.5 h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white"
                  />
                </label>

                {notice && (
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{notice}</div>
                )}
                {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-8">
                <button
                  type="button"
                  onClick={goBackToPassword}
                  className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <h2 className="text-2xl font-bold text-slate-950">Two-factor verification</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Enter the 6-digit code for <span className="font-medium text-slate-700">{twoFaHint}</span>. In
                  development the server logs the code; in production configure SMS/email or set{' '}
                  <code className="rounded bg-slate-100 px-1 text-xs">TWO_FACTOR_LOG_OTP=true</code> only for debugging.
                </p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  One-time code
                  <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-400 focus-within:bg-white">
                    <Shield className="h-4 w-4 text-slate-400" />
                    <input
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="min-w-0 flex-1 bg-transparent text-sm tracking-widest outline-none"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      maxLength={6}
                      required
                    />
                  </span>
                </label>

                {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</div>}

                <button
                  type="submit"
                  disabled={loading || otpCode.length < 6}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify and continue'}
                  <KeyRound className="h-4 w-4" />
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            <Link href="/forgot-password" className="font-semibold text-blue-700 hover:text-blue-900">
              Forgot your password?
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
