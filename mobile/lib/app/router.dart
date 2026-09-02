import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../core/auth_notifier.dart';
import '../core/permissions.dart';
import '../features/auth/auth_screens.dart';
import '../features/chat/conversation_screen.dart';
import '../features/files/files_screen.dart';
import '../features/people/people_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shell/shell_screen.dart';

String? _moduleKeyFor(String location) {
  if (location.startsWith('/teams')) return 'teams';
  if (location.startsWith('/dms') || location.startsWith('/chat')) return 'dms';
  if (location.startsWith('/activity')) return 'activity';
  if (location.startsWith('/files')) return 'files';
  if (location.startsWith('/people')) return 'people';
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(authProvider, (_, _) => refresh.value++);

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: refresh,
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      if (auth.booting) return null;
      final loc = state.matchedLocation;
      final loggingIn = loc.startsWith('/login') ||
          loc == '/forgot-password' ||
          loc == '/reset-password';
      if (!auth.isLoggedIn && !loggingIn) return '/login';
      if (auth.isLoggedIn && loggingIn) return '/home';
      if (auth.isLoggedIn) {
        final key = _moduleKeyFor(loc);
        if (key != null && !navKeyAllowed(key, auth.user)) return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/login/2fa',
        builder: (_, state) => TwoFactorScreen(verifyKey: '${state.extra ?? ''}'),
      ),
      GoRoute(path: '/forgot-password', builder: (_, _) => const ForgotPasswordScreen()),
      GoRoute(path: '/reset-password', builder: (_, _) => const ResetPasswordScreen()),
      GoRoute(path: '/home', builder: (_, _) => const ShellScreen(index: 0)),
      GoRoute(path: '/teams', builder: (_, _) => const ShellScreen(index: 1)),
      GoRoute(path: '/dms', builder: (_, _) => const ShellScreen(index: 2)),
      GoRoute(path: '/calls', builder: (_, _) => const ShellScreen(index: 3)),
      GoRoute(path: '/activity', builder: (_, _) => const ShellScreen(index: 4)),
      GoRoute(path: '/files', builder: (_, _) => const FilesScreen()),
      GoRoute(path: '/people', builder: (_, _) => const PeopleScreen()),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsScreen()),
      GoRoute(
        path: '/chat/:id',
        builder: (context, state) {
          final id = state.pathParameters['id'] ?? '';
          final title = state.uri.queryParameters['title'] ?? 'Chat';
          final type = state.uri.queryParameters['type'] ?? 'GROUP';
          return ConversationScreen(conversationId: id, title: title, type: type);
        },
      ),
    ],
  );
});
