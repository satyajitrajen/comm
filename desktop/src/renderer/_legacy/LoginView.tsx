import React, { useState, FormEvent } from 'react';
import { Mail, Lock, Send, Shield, KeyRound, ArrowLeft, MessageSquare, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../api/api';
import { useAppStore } from '../store/useAppStore';

type AuthResponse = {
  accessToken: string;
  refreshToken?: string;
  sessionId?: string;
  user: {
    id: string;
    email?: string | null;
    displayName: string;
    avatarUrl?: string | null;
    role?: string | null;
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

export const LoginView: React.FC = () => {
  const { setAuthenticated, setCurrentUser } = useAppStore();
  const [step, setStep] = useState<'password' | 'otp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [twoFaVerifyKey, setTwoFaVerifyKey] = useState('');
  const [twoFaHint, setTwoFaHint] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const persistSession = (session: AuthResponse) => {
    localStorage.setItem('auth_token', session.accessToken);
    localStorage.setItem('veloce_token', session.accessToken);
    if (session.refreshToken) localStorage.setItem('veloce_refresh', session.refreshToken);
    if (session.sessionId) localStorage.setItem('veloce_session', session.sessionId);
    localStorage.setItem('veloce_user', JSON.stringify(session.user));

    setCurrentUser({
      id: session.user.id,
      name: session.user.displayName,
      email: session.user.email || '',
      avatarUrl: session.user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      status: 'online',
      role: session.user.role || 'Member',
    });
    setAuthenticated(true);
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
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
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Check your email and password, then try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const session = await authAPI.verifyTwoFactor({
        verifyKey: twoFaVerifyKey,
        otpCode: otpCode.replace(/\s/g, ''),
      });
      persistSession(session as AuthResponse);
    } catch {
      setError('That code is incorrect or has expired. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 p-6 select-none">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl lg:grid-cols-[1fr_1fr]">
        
        {/* Left Dark Workspace Banner */}
        <div className="flex flex-col justify-between bg-[#08214a] p-8 text-white">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 font-bold text-white text-xl shadow-md">
              ⚡
            </div>
            <div>
              <div className="text-base font-bold">Comm Workspace</div>
              <div className="text-xs text-blue-200">Windows Desktop Application</div>
            </div>
          </div>

          <div className="space-y-4 my-8">
            <div className="inline-flex items-center space-x-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-blue-100 border border-white/10">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Real-time Team Desktop App</span>
            </div>
            <h1 className="text-2xl font-extrabold leading-tight">
              One unified desktop workspace for team chat, calls, and files.
            </h1>
            <p className="text-xs leading-relaxed text-blue-100">
              Sign in with your workspace credentials to access team channels, direct messages, calendar events, shared files, and WebRTC video calls.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-blue-100">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">Channels</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">Direct Chat</div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">Video Calls</div>
          </div>
        </div>

        {/* Right Form Card */}
        <div className="flex flex-col justify-center p-8 bg-white">
          {step === 'password' ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-slate-900">Sign in to Comm</h2>
                <p className="mt-1 text-xs text-slate-500">Enter your workspace account credentials to continue.</p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <div className="flex h-10 items-center space-x-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-500 focus-within:bg-white transition-all">
                    <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex.mercer@comm.internal"
                      className="w-full bg-transparent text-slate-900 outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="flex h-10 items-center space-x-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-500 focus-within:bg-white transition-all">
                    <Lock className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-transparent text-slate-900 outline-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim() || !password}
                  className="flex h-10 w-full items-center justify-center space-x-2 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-xs"
                >
                  <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setStep('password')}
                  className="mb-3 inline-flex items-center space-x-1 text-xs font-bold text-slate-600 hover:text-indigo-600"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Sign In</span>
                </button>
                <h2 className="text-xl font-bold text-slate-900">Two-Factor Verification</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Enter the 6-digit code sent to <span className="font-semibold text-slate-800">{twoFaHint}</span>.
                </p>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    One-Time 6-Digit Code
                  </label>
                  <div className="flex h-10 items-center space-x-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-indigo-500 focus-within:bg-white transition-all">
                    <Shield className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full bg-transparent tracking-widest text-slate-900 outline-none font-mono text-sm"
                      maxLength={6}
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || otpCode.length < 6}
                  className="flex h-10 w-full items-center justify-center space-x-2 rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-xs"
                >
                  <span>{loading ? 'Verifying...' : 'Verify & Continue'}</span>
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
