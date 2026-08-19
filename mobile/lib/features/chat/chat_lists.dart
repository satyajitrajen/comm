import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
    return const _FeedList(title: 'Chat', types: {'DIRECT'});
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
      return c['recipient']?['displayName'] as String? ?? 'Direct message';
    }
    return c['group']?['name'] as String? ?? c['group']?['teamName'] as String? ?? 'Channel';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
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
            onRefresh: () async => setState(() => _future = _load()),
            child: ListView.separated(
              itemCount: items.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final c = items[i];
                final unread = c['unreadCount'] ?? 0;
                return ListTile(
                  leading: TtAvatar(name: _title(c), url: c['recipient']?['avatarUrl'] as String?),
                  title: Text(_title(c)),
                  subtitle: Text(
                    '${c['messages'] is List && (c['messages'] as List).isNotEmpty ? (c['messages'] as List).first['content'] ?? '' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: unread is int && unread > 0
                      ? CircleAvatar(radius: 10, child: Text('$unread', style: const TextStyle(fontSize: 11)))
                      : null,
                  onTap: () => context.push(
                    '/chat/${c['conversationId']}?title=${Uri.encodeComponent(_title(c))}&type=${c['type']}',
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
