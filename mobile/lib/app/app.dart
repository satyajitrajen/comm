import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'router.dart';
import 'theme.dart';
import '../core/auth_notifier.dart';
import '../core/fcm.dart';
import '../core/socket_client.dart';
import '../features/calls/call_controller.dart';
import '../features/calls/incoming_call_overlay.dart';
import '../widgets/app_background.dart';

class TeamTimeApp extends ConsumerStatefulWidget {
  const TeamTimeApp({super.key});

  @override
  ConsumerState<TeamTimeApp> createState() => _TeamTimeAppState();
}

class _TeamTimeAppState extends ConsumerState<TeamTimeApp> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    Future.microtask(() async {
      await initLocalNotifications();
      if (ref.read(authProvider).isLoggedIn) {
        final api = ref.read(apiClientProvider);
        await registerAndroidPush(api);
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (ref.read(authProvider).isLoggedIn) {
        ref.read(socketClientProvider).connect();
        final api = ref.read(apiClientProvider);
        registerAndroidPush(api);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final call = ref.watch(callControllerProvider);

    ref.listen(authProvider, (prev, next) {
      if (!next.isLoggedIn) return;
      final api = ref.read(apiClientProvider);
      ref.read(socketClientProvider).connect();
      if (prev?.isLoggedIn != true) {
        initLocalNotifications();
        registerAndroidPush(api);
      }
      attachPushRouting(router.go);
    });

    return MaterialApp.router(
      title: 'TeamTime',
      theme: TeamTimeTheme.light(),
      routerConfig: router,
      builder: (context, child) => Stack(
        children: [
          AppBackground(
            child: child ?? const SizedBox.shrink(),
          ),
          if (call.incoming != null && !call.inCall)
            IncomingCallOverlay(call: call.incoming!),
          if (call.outgoing != null && !call.inCall)
            OutgoingCallOverlay(outgoing: call.outgoing!),
        ],
      ),
    );
  }
}

