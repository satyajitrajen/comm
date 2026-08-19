import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router.dart';
import 'theme.dart';
import '../core/auth_notifier.dart';
import '../core/fcm.dart';

class TeamTimeApp extends ConsumerWidget {
  const TeamTimeApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    ref.listen(authProvider, (prev, next) {
      if (!next.isLoggedIn) return;
      final api = ref.read(apiClientProvider);
      if (prev?.isLoggedIn != true) {
        registerAndroidPush(api);
      }
      attachPushRouting(router.go);
    });
    return MaterialApp.router(
      title: 'TeamTime',
      theme: TeamTimeTheme.light(),
      routerConfig: router,
    );
  }
}
