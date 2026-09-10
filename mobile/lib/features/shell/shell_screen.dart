import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth_notifier.dart';
import '../../core/permissions.dart';
import '../../core/socket_client.dart';
import '../../widgets/common.dart';

class ShellScreen extends ConsumerStatefulWidget {
  const ShellScreen({super.key, required this.shell});
  final StatefulNavigationShell shell;
  @override
  ConsumerState<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends ConsumerState<ShellScreen> {
  static const _branches = <({int branch, String key, String label, IconData icon})>[
    (branch: 0, key: 'home', label: 'Home', icon: Icons.home_outlined),
    (branch: 1, key: 'teams', label: 'Teams', icon: Icons.groups_outlined),
    (branch: 2, key: 'dms', label: 'Chats', icon: Icons.chat_bubble_outline_rounded),
    (branch: 3, key: 'calls', label: 'Calls', icon: Icons.call_outlined),
    (branch: 4, key: 'activity', label: 'Activity', icon: Icons.notifications_outlined),
  ];

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    final socketStatus = ref.watch(socketStatusProvider);
    final visible =
        _branches.where((e) => navKeyAllowed(e.key, user)).toList();

    if (visible.isEmpty) {
      return const Scaffold(body: EmptyState(message: 'No modules available'));
    }

    final currentBranch = widget.shell.currentIndex;
    final selectedIndex =
        visible.indexWhere((e) => e.branch == currentBranch).clamp(0, visible.length - 1);
    final destinations = visible
        .map((e) => NavigationDestination(icon: Icon(e.icon), label: e.label))
        .toList();

    return Scaffold(
      body: Stack(
        children: [
          // The shell is an IndexedStack: branch state survives tab switches.
          widget.shell,
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
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        destinations: destinations,
        onDestinationSelected: (i) {
          final target = visible[i].branch;
          widget.shell.goBranch(
            target,
            initialLocation: target == currentBranch,
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _more(user),
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 3,
        shape: const StadiumBorder(),
        label: const Text('More', style: TextStyle(fontWeight: FontWeight.w600)),
        icon: const Icon(Icons.more_horiz_rounded),
      ),
    );
  }

  void _more(Map<String, dynamic>? user) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              if (navKeyAllowed('files', user))
                ListTile(
                  leading: const Icon(Icons.folder_outlined, color: Color(0xFF0284C7)),
                  title: const Text('Files', style: TextStyle(fontWeight: FontWeight.w600)),
                  onTap: () {
                    Navigator.pop(ctx);
                    context.push('/files');
                  },
                ),
              if (navKeyAllowed('people', user))
                ListTile(
                  leading: const Icon(Icons.people_outline, color: Color(0xFF0284C7)),
                  title: const Text('People', style: TextStyle(fontWeight: FontWeight.w600)),
                  onTap: () {
                    Navigator.pop(ctx);
                    context.push('/people');
                  },
                ),
              ListTile(
                leading: const Icon(Icons.calendar_month_outlined, color: Color(0xFF0284C7)),
                title: const Text('Calendar & Events', style: TextStyle(fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.pop(ctx);
                  context.push('/events');
                },
              ),
              ListTile(
                leading: const Icon(Icons.settings_outlined, color: Color(0xFF0284C7)),
                title: const Text('Settings', style: TextStyle(fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.pop(ctx);
                  context.push('/settings');
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

