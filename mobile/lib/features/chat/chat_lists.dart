import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';

class TeamsListScreen extends ConsumerWidget {
  const TeamsListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return const _FeedList(title: 'Teams', types: {'TEAM', 'GROUP', 'CHANNEL'});
  }
}

class DmsListScreen extends ConsumerWidget {
  const DmsListScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return const _FeedList(title: 'Chats', types: {'DIRECT'});
  }
}

class _FeedList extends ConsumerStatefulWidget {
  const _FeedList({required this.title, required this.types});
  final String title;
  final Set<String> types;
  @override
  ConsumerState<_FeedList> createState() => _FeedListState();
}

class _FeedListState extends ConsumerState<_FeedList> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final res = await ref.read(apiClientProvider).dio.get('/api/v1/chats');
    final data = res.data;
    final list = data is List ? data : (data is Map && data['items'] is List ? data['items'] as List : []);
    return list
        .map((e) => Map<String, dynamic>.from(e as Map))
        .where((c) => widget.types.contains('${c['type']}'))
        .toList();
  }

  String _title(Map<String, dynamic> c) {
    if (c['type'] == 'DIRECT') {
      return c['recipient']?['displayName'] as String? ??
          c['name'] as String? ??
          'Direct message';
    }
    return c['name'] as String? ??
        c['group']?['name'] as String? ??
        c['group']?['teamName'] as String? ??
        'Group';
  }

  String _formatTime(dynamic raw) {
    if (raw == null) return '';
    final dt = DateTime.tryParse(raw.toString())?.toLocal();
    if (dt == null) return '';
    final now = DateTime.now();
    if (dt.year == now.year && dt.month == now.month && dt.day == now.day) {
      return DateFormat('HH:mm').format(dt);
    }
    final diff = now.difference(dt);
    if (diff.inDays == 1) {
      return 'Yesterday';
    }
    if (diff.inDays < 7) {
      return DateFormat('EEE').format(dt);
    }
    return DateFormat('MM/dd').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final meId = ref.watch(authProvider).user?['id']?.toString() ?? '';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 20,
        title: Text(
          widget.title,
          style: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
            letterSpacing: -0.5,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.more_horiz_rounded, size: 28, color: Color(0xFF0F172A)),
            tooltip: 'More options',
            onPressed: () {},
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: FutureBuilder(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return EmptyState(
              message: apiError(snap.error!),
              onRetry: () => setState(() => _future = _load()),
            );
          }
          final items = snap.data ?? [];
          if (items.isEmpty) return EmptyState(message: 'No ${widget.title.toLowerCase()} yet');
          return RefreshIndicator(
            color: const Color(0xFF0284C7),
            onRefresh: () async => setState(() => _future = _load()),
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: items.length,
              separatorBuilder: (context, i) => const SizedBox(height: 2),
              itemBuilder: (context, i) {
                final c = items[i];
                final name = _title(c);
                final avatarUrl = c['avatarUrl'] as String? ?? c['recipient']?['avatarUrl'] as String?;
                final unread = c['unreadCount'] is int ? c['unreadCount'] as int : 0;

                final lastMsg = c['lastMessage'] as Map<String, dynamic>? ??
                    (c['messages'] is List && (c['messages'] as List).isNotEmpty
                        ? Map<String, dynamic>.from((c['messages'] as List).first as Map)
                        : null);
                final content = lastMsg?['content']?.toString() ?? '';
                final senderId = lastMsg?['senderId']?.toString();
                final isMine = senderId != null && senderId == meId;

                String preview = content;
                if (preview.isEmpty && lastMsg != null) {
                  final msgType = lastMsg['messageType']?.toString();
                  if (msgType == 'FILE') {
                    preview = '📎 Shared a file';
                  } else if (msgType == 'POLL') {
                    preview = '📊 Poll';
                  } else if (msgType == 'CALL') {
                    preview = '📞 Call';
                  }
                }
                if (c['type'] != 'DIRECT' && lastMsg != null && !isMine && preview.isNotEmpty) {
                  final senderName = lastMsg['sender']?['profile']?['displayName'] as String? ??
                      lastMsg['senderName'] as String?;
                  if (senderName != null && senderName.isNotEmpty && !preview.startsWith('$senderName:')) {
                    preview = '$senderName: $preview';
                  }
                }

                final timeStr = _formatTime(lastMsg?['createdAt'] ?? c['updatedAt']);
                final cid = c['conversationId'] ?? c['id'];

                return Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => context.push(
                      '/chat/$cid?title=${Uri.encodeComponent(name)}&type=${c['type']}',
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                      child: Row(
                        children: [
                          TtAvatar(name: name, url: avatarUrl, size: 54),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: Color(0xFF0F172A),
                                    letterSpacing: -0.2,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Row(
                                  children: [
                                    if (isMine) ...[
                                      const Icon(
                                        Icons.done_all_rounded,
                                        size: 16,
                                        color: Color(0xFF94A3B8),
                                      ),
                                      const SizedBox(width: 4),
                                    ],
                                    Expanded(
                                      child: Text(
                                        preview.isEmpty ? 'No messages yet' : preview,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontSize: 14,
                                          color: preview.isEmpty
                                              ? const Color(0xFF94A3B8)
                                              : (unread > 0 ? const Color(0xFF0F172A) : const Color(0xFF64748B)),
                                          fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.w400,
                                          fontStyle: preview.isEmpty ? FontStyle.italic : FontStyle.normal,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                timeStr,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.w500,
                                  color: unread > 0 ? const Color(0xFF0284C7) : const Color(0xFF94A3B8),
                                ),
                              ),
                              const SizedBox(height: 6),
                              if (unread > 0)
                                Container(
                                  width: 20,
                                  height: 20,
                                  decoration: const BoxDecoration(
                                    color: Color(0xFFF59E0B),
                                    shape: BoxShape.circle,
                                  ),
                                  child: Center(
                                    child: Text(
                                      unread > 99 ? '99+' : '$unread',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                )
                              else
                                const SizedBox(height: 20),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
