import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final res = await ref.read(apiClientProvider).dio.get('/api/v1/dashboard');
    return Map<String, dynamic>.from(res.data as Map);
  }

  String _formatEventDate(String? raw) {
    if (raw == null) return '';
    final dt = DateTime.tryParse(raw)?.toLocal();
    if (dt == null) return raw;
    final now = DateTime.now();
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
      return 'Today, ${DateFormat('h:mm a').format(dt)}';
    }
    return DateFormat('MMM d • h:mm a').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final name = ref.watch(authProvider).user?['displayName'] as String? ?? 'there';
    return Scaffold(
      appBar: AppBar(title: const Text('Home')),
      body: FutureBuilder(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return EmptyState(message: apiError(snap.error!), onRetry: () => setState(() => _future = _load()));
          }
          final d = snap.data ?? {};
          final upcoming = (d['upcomingEvents'] as List?) ?? [];
          return RefreshIndicator(
            onRefresh: () async => setState(() => _future = _load()),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Hello, $name', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _stat('Unread', '${d['unreadCount'] ?? 0}', onTap: () => context.push('/dms')),
                    _stat('Tasks', '${d['openTaskCount'] ?? 0}', onTap: () => context.push('/activity')),
                    _stat('Files', '${d['fileCount'] ?? 0}', onTap: () => context.push('/files')),
                    _stat('Events', '${d['upcomingEventCount'] ?? 0}', onTap: () => context.push('/events')),
                  ],
                ),
                const SizedBox(height: 24),
                const Text('Recent conversations', style: TextStyle(fontWeight: FontWeight.w600)),
                ...((d['recentConversations'] as List?) ?? []).take(8).map((raw) {
                  final c = Map<String, dynamic>.from(raw as Map);
                  final title = c['name'] as String? ?? c['group']?['name'] as String? ?? 'Chat';
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(title),
                    subtitle: Text('${c['lastMessage']?['content'] ?? ''}', maxLines: 1),
                    onTap: () => context.push(
                      '/chat/${c['conversationId'] ?? c['id']}?title=${Uri.encodeComponent(title)}&type=${c['type'] ?? 'GROUP'}',
                    ),
                  );
                }),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Upcoming Events', style: TextStyle(fontWeight: FontWeight.w600)),
                    if (upcoming.isNotEmpty)
                      TextButton(
                        onPressed: () => context.push('/events'),
                        child: const Text('View all'),
                      ),
                  ],
                ),
                if (upcoming.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8),
                    child: Text('No upcoming events scheduled', style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8))),
                  )
                else
                  ...upcoming.take(5).map((raw) {
                    final e = Map<String, dynamic>.from(raw as Map);
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.event_note_rounded, color: Color(0xFF1D4ED8)),
                      title: Text('${e['title'] ?? 'Event'}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(_formatEventDate(e['startsAt'] as String?)),
                      trailing: const Icon(Icons.chevron_right, size: 20, color: Color(0xFF94A3B8)),
                      onTap: () => context.push('/events'),
                    );
                  }),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _stat(String label, String value, {VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        width: 96,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          children: [
            Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Color(0xFF0284C7))),
            Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          ],
        ),
      ),
    );
  }
}
