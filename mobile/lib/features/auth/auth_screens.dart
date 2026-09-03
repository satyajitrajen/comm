import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';
import '../../widgets/design_system.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _id = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _id.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await ref.read(authProvider.notifier).login(
            identifier: _id.text.trim(),
            password: _password.text,
          );
      if (!mounted) return;
      if (data['needsTwoFactor'] == true) {
        context.go('/login/2fa', extra: data['verifyKey'] as String? ?? _id.text.trim());
      } else {
        context.go('/home');
      }
    } catch (e) {
      setState(() => _error = apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          children: [
            const SizedBox(height: 24),
            Align(
              alignment: Alignment.centerLeft,
              child: TtSquircleBadge(
                size: 60,
                radius: 20,
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF38BDF8), Color(0xFF0284C7)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.hub_rounded, color: Colors.white, size: 24),
                ),
              ),
            ),
            const SizedBox(height: 28),
            const Text(
              'Your workspace,\nupgraded',
              style: TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
                height: 1.15,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Collaborate, chat, and meet with stable real-time connectivity.',
              style: TextStyle(
                fontSize: 15,
                color: Color(0xFF334155),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 36),
            TextField(
              controller: _id,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.username],
              style: const TextStyle(color: Color(0xFF0F172A), fontSize: 16),
              decoration: const InputDecoration(
                labelText: 'Email or phone',
                labelStyle: TextStyle(color: Color(0xFF475569)),
                prefixIcon: Icon(Icons.person_outline_rounded, color: Color(0xFF64748B)),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _password,
              obscureText: _obscurePassword,
              autofillHints: const [AutofillHints.password],
              style: const TextStyle(color: Color(0xFF0F172A), fontSize: 16),
              decoration: InputDecoration(
                labelText: 'Password',
                labelStyle: const TextStyle(color: Color(0xFF475569)),
                prefixIcon: const Icon(Icons.lock_outline_rounded, color: Color(0xFF64748B)),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    color: const Color(0xFF64748B),
                  ),
                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                  tooltip: _obscurePassword ? 'Show password' : 'Hide password',
                ),
              ),
              onSubmitted: (_) => _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFF87171)),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Color(0xFF991B1B), fontWeight: FontWeight.w600),
                ),
              ),
            ],
            const SizedBox(height: 28),
            TtButton.primary(
              text: 'Sign in',
              icon: Icons.login_rounded,
              busy: _busy,
              onPressed: _submit,
            ),
            const SizedBox(height: 14),
            TtButton.secondary(
              text: 'Forgot password',
              icon: Icons.help_outline_rounded,
              onPressed: () => context.push('/forgot-password'),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class TwoFactorScreen extends ConsumerStatefulWidget {
  const TwoFactorScreen({super.key, required this.verifyKey});
  final String verifyKey;
  @override
  ConsumerState<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends ConsumerState<TwoFactorScreen> {
  final _otp = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _otp.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).verify2fa(
            verifyKey: widget.verifyKey,
            otpCode: _otp.text.trim(),
          );
      if (mounted) context.go('/home');
    } catch (e) {
      setState(() => _error = apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Two-factor', style: TextStyle(color: Color(0xFF0F172A), fontWeight: FontWeight.w700)),
        iconTheme: const IconThemeData(color: Color(0xFF0F172A)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          children: [
            const SizedBox(height: 16),
            const Align(
              alignment: Alignment.centerLeft,
              child: TtSquircleBadge(
                size: 60,
                radius: 20,
                child: Icon(Icons.security_rounded, color: Color(0xFF0284C7), size: 28),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Verify your\nidentity',
              style: TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
                height: 1.15,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Enter the 6-digit security code sent to ${widget.verifyKey}.',
              style: const TextStyle(
                fontSize: 15,
                color: Color(0xFF334155),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _otp,
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 22,
                letterSpacing: 4,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
              ),
              decoration: const InputDecoration(
                hintText: '• • • • • •',
                hintStyle: TextStyle(letterSpacing: 4, color: Color(0xFF94A3B8)),
              ),
              onSubmitted: (_) => _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFF87171)),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Color(0xFF991B1B), fontWeight: FontWeight.w600),
                ),
              ),
            ],
            const SizedBox(height: 28),
            TtButton.primary(
              text: 'Verify and Continue',
              icon: Icons.check_circle_outline_rounded,
              busy: _busy,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});
  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _email = TextEditingController();
  String? _done;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).forgotPassword(_email.text.trim());
      setState(() => _done = 'If that address has an account, a reset link is on its way.');
    } catch (e) {
      setState(() => _error = apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Recovery', style: TextStyle(color: Color(0xFF0F172A), fontWeight: FontWeight.w700)),
        iconTheme: const IconThemeData(color: Color(0xFF0F172A)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          children: [
            const SizedBox(height: 16),
            const Align(
              alignment: Alignment.centerLeft,
              child: TtSquircleBadge(
                size: 60,
                radius: 20,
                child: Icon(Icons.lock_reset_rounded, color: Color(0xFF0284C7), size: 28),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Reset your\npassword',
              style: TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
                height: 1.15,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Enter your registered email and we will send you instructions to recover your account.',
              style: TextStyle(
                fontSize: 15,
                color: Color(0xFF334155),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              style: const TextStyle(color: Color(0xFF0F172A), fontSize: 16),
              decoration: const InputDecoration(
                labelText: 'Account email',
                labelStyle: TextStyle(color: Color(0xFF475569)),
                prefixIcon: Icon(Icons.email_outlined, color: Color(0xFF64748B)),
              ),
              onSubmitted: (_) => _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFF87171)),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Color(0xFF991B1B), fontWeight: FontWeight.w600),
                ),
              ),
            ],
            if (_done != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFD1FAE5),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF34D399)),
                ),
                child: Text(
                  _done!,
                  style: const TextStyle(color: Color(0xFF065F46), fontWeight: FontWeight.w600),
                ),
              ),
            ],
            const SizedBox(height: 28),
            TtButton.primary(
              text: 'Send reset email',
              icon: Icons.send_rounded,
              busy: _busy,
              onPressed: _submit,
            ),
            const SizedBox(height: 14),
            TtButton.secondary(
              text: 'I already have a token',
              icon: Icons.key_rounded,
              onPressed: () => context.push('/reset-password'),
            ),
          ],
        ),
      ),
    );
  }
}

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key});
  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _token = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _token.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).resetPassword(
            token: _token.text.trim(),
            password: _password.text,
          );
      if (mounted) context.go('/login');
    } catch (e) {
      setState(() => _error = apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Update password', style: TextStyle(color: Color(0xFF0F172A), fontWeight: FontWeight.w700)),
        iconTheme: const IconThemeData(color: Color(0xFF0F172A)),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          children: [
            const SizedBox(height: 16),
            const Align(
              alignment: Alignment.centerLeft,
              child: TtSquircleBadge(
                size: 60,
                radius: 20,
                child: Icon(Icons.vpn_key_rounded, color: Color(0xFF0284C7), size: 28),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Set new\npassword',
              style: TextStyle(
                fontSize: 34,
                fontWeight: FontWeight.w700,
                color: Color(0xFF0F172A),
                height: 1.15,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Paste your reset token and enter your new password.',
              style: TextStyle(
                fontSize: 15,
                color: Color(0xFF334155),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 32),
            TextField(
              controller: _token,
              style: const TextStyle(color: Color(0xFF0F172A), fontSize: 16),
              decoration: const InputDecoration(
                labelText: 'Reset token',
                labelStyle: TextStyle(color: Color(0xFF475569)),
                prefixIcon: Icon(Icons.key_outlined, color: Color(0xFF64748B)),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _password,
              obscureText: _obscurePassword,
              style: const TextStyle(color: Color(0xFF0F172A), fontSize: 16),
              decoration: InputDecoration(
                labelText: 'New password (min 8)',
                labelStyle: const TextStyle(color: Color(0xFF475569)),
                prefixIcon: const Icon(Icons.lock_outline_rounded, color: Color(0xFF64748B)),
                suffixIcon: IconButton(
                  icon: Icon(
                    _obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    color: const Color(0xFF64748B),
                  ),
                  onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                  tooltip: _obscurePassword ? 'Show password' : 'Hide password',
                ),
              ),
              onSubmitted: (_) => _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEE2E2),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFF87171)),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Color(0xFF991B1B), fontWeight: FontWeight.w600),
                ),
              ),
            ],
            const SizedBox(height: 28),
            TtButton.primary(
              text: 'Save new password',
              icon: Icons.check_rounded,
              busy: _busy,
              onPressed: _submit,
            ),
            const SizedBox(height: 14),
            TtButton.secondary(
              text: 'Back to sign in',
              icon: Icons.arrow_back_rounded,
              onPressed: () => context.go('/login'),
            ),
          ],
        ),
      ),
    );
  }
}
