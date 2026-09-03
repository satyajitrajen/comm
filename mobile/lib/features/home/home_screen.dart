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
            return EmptyState(
              message: apiError(snap.error!),
              onRetry: () {
                final f = _load();
                setState(() => _future = f);
              },
            );
          }
          final d = snap.data ?? {};
          final upcoming = (d['upcomingEvents'] as List?) ?? [];
          return RefreshIndicator(
            onRefresh: () async {
              final f = _load();
              setState(() => _future = f);
              await f;
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Hello, $name', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600)),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    _stat('Unread', '${d['unreadCount'] ?? 0}', Icons.chat_bubble_outline_rounded, onTap: () => context.push('/dms')),
                    _stat('Tasks', '${d['openTaskCount'] ?? 0}', Icons.check_circle_outline_rounded, onTap: () => context.push('/activity')),
                    _stat('Files', '${d['fileCount'] ?? 0}', Icons.folder_outlined, onTap: () => context.push('/files')),
                    _stat('Events', '${d['upcomingEventCount'] ?? 0}', Icons.event_note_rounded, onTap: () => context.push('/events')),
                  ],
                ),
                const SizedBox(height: 24),
                const Text('Recent conversations', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                ...((d['recentConversations'] as List?) ?? []).take(8).map((raw) {
                  final c = Map<String, dynamic>.from(raw as Map);
                  final title = c['name'] as String? ?? c['group']?['name'] as String? ?? 'Chat';
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: const [
                        BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
                      ],
                    ),
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      leading: TtAvatar(
                        name: title,
                        url: c['avatarUrl'] as String? ?? c['recipient']?['avatarUrl'] as String?,
                        size: 42,
                      ),
                      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        '${c['lastMessage']?['content'] ?? ''}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Color(0xFF64748B)),
                      ),
                      trailing: (c['unreadCount'] is int && (c['unreadCount'] as int) > 0)
                          ? Container(
                              width: 20,
                              height: 20,
                              decoration: const BoxDecoration(
                                color: Color(0xFFF59E0B),
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  (c['unreadCount'] as int) > 99 ? '99+' : '${c['unreadCount']}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            )
                          : const Icon(Icons.chevron_right_rounded, color: Color(0xFF94A3B8)),
                      onTap: () => context.push(
                        '/chat/${c['conversationId'] ?? c['id']}?title=${Uri.encodeComponent(title)}&type=${c['type'] ?? 'GROUP'}',
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 24),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Upcoming Events', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
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
                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: const [
                          BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
                        ],
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                        leading: const CircleAvatar(
                          backgroundColor: Color(0xFFEEF2FF),
                          foregroundColor: Color(0xFF1D4ED8),
                          child: Icon(Icons.event_note_rounded, size: 20),
                        ),
                        title: Text('${e['title'] ?? 'Event'}', style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(_formatEventDate(e['startsAt'] as String?)),
                        trailing: const Icon(Icons.chevron_right_rounded, size: 20, color: Color(0xFF94A3B8)),
                        onTap: () => context.push('/events'),
                      ),
                    );
                  }),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _stat(String label, String value, IconData icon, {VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: 104,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0D000000),
              blurRadius: 10,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: const Color(0xFF0284C7)),
            const SizedBox(height: 8),
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFF0F172A))),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Color(0xFF64748B))),
          ],
        ),
      ),
    );
  }
}
