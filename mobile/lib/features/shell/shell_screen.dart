import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth_notifier.dart';
import '../../core/permissions.dart';
import '../../core/socket_client.dart';
import '../../widgets/common.dart';
import '../calls/call_controller.dart';
import '../activity/activity_screen.dart';
import '../calls/calls_screen.dart';
import '../chat/chat_lists.dart';
import '../home/home_screen.dart';

class ShellScreen extends ConsumerStatefulWidget {
  const ShellScreen({super.key, required this.index});
  final int index;
  @override
  ConsumerState<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends ConsumerState<ShellScreen> {
  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final call = ref.watch(callControllerProvider);
    final socketStatus = ref.watch(socketStatusProvider);
    final pages = <({int i, String key, String label, IconData icon, Widget page})>[
      (i: 0, key: 'home', label: 'Home', icon: Icons.home_outlined, page: const HomeScreen()),
      (i: 1, key: 'teams', label: 'Teams', icon: Icons.groups_outlined, page: const TeamsListScreen()),
      (i: 2, key: 'dms', label: 'Chat', icon: Icons.chat_bubble_outline, page: const DmsListScreen()),
      (i: 3, key: 'calls', label: 'Calls', icon: Icons.call_outlined, page: const CallsScreen()),
      (i: 4, key: 'activity', label: 'Activity', icon: Icons.notifications_outlined, page: const ActivityScreen()),
    ].where((e) => navKeyAllowed(e.key, user)).toList();

    if (pages.isEmpty) {
      return const Scaffold(body: EmptyState(message: 'No modules available'));
    }

    final safeIndex = widget.index.clamp(0, pages.length - 1);
    final destinations = pages
        .map((e) => NavigationDestination(icon: Icon(e.icon), label: e.label))
        .toList();

    return Scaffold(
      body: Stack(
        children: [
          pages[safeIndex].page,
          if (socketStatus == SocketStatus.reconnecting)
            const Align(
              alignment: Alignment.topCenter,
              child: Material(
                color: Color(0xFF0F172A),
                child: SafeArea(
                  child: Padding(
                    padding: EdgeInsets.all(12),
                    child: Text(
                      'Reconnecting…',
                      style: TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
          if (call.incoming != null)
            IncomingCallOverlay(call: call.incoming!),
          if (call.outgoingName != null && !call.inCall)
            Align(
              alignment: Alignment.topCenter,
              child: Material(
                color: const Color(0xFF0F172A),
                child: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      'Calling ${call.outgoingName}…',
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: safeIndex,
        destinations: destinations,
        onDestinationSelected: (i) {
          context.go('/${pages[i].key}');
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _more(user),
        label: const Text('More'),
        icon: const Icon(Icons.more_horiz),
      ),
    );
  }

  void _more(Map<String, dynamic>? user) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (navKeyAllowed('files', user))
              ListTile(
                leading: const Icon(Icons.folder_outlined),
                title: const Text('Files'),
                onTap: () {
                  Navigator.pop(ctx);
                  context.push('/files');
                },
              ),
            if (navKeyAllowed('people', user))
              ListTile(
                leading: const Icon(Icons.people_outline),
                title: const Text('People'),
                onTap: () {
                  Navigator.pop(ctx);
                  context.push('/people');
                },
              ),
            ListTile(
              leading: const Icon(Icons.calendar_month_outlined),
              title: const Text('Calendar & Events'),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/events');
              },
            ),
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: const Text('Settings'),
              onTap: () {
                Navigator.pop(ctx);
                context.push('/settings');
              },
            ),
          ],
        ),
      ),
    );
  }
}

class IncomingCallOverlay extends ConsumerWidget {
  const IncomingCallOverlay({super.key, required this.call});
  final IncomingCall call;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Material(
      color: const Color(0xF00F172A),
      child: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.videocam, color: Colors.white, size: 48),
              const SizedBox(height: 12),
              Text('Incoming call from ${call.callerName}',
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
              Text(call.conversationName, style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
                    onPressed: () => ref.read(callControllerProvider.notifier).accept(),
                    child: const Text('Accept'),
                  ),
                  const SizedBox(width: 16),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE11D48)),
                    onPressed: () => ref.read(callControllerProvider.notifier).decline(),
                    child: const Text('Decline'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
