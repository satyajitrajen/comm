import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';

class ActivityScreen extends ConsumerStatefulWidget {
  const ActivityScreen({super.key});
  @override
  ConsumerState<ActivityScreen> createState() => _ActivityScreenState();
}

class _ActivityScreenState extends ConsumerState<ActivityScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final res = await ref.read(apiClientProvider).dio.get('/api/v1/notifications', queryParameters: {'page': 1, 'limit': 50});
    final data = res.data;
    final list = data is Map && data['items'] is List
        ? data['items'] as List
        : data is Map && data['notifications'] is List
            ? data['notifications'] as List
            : data is List
                ? data
                : [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Activity'),
        actions: [
          TextButton(
            onPressed: () async {
              await ref.read(apiClientProvider).dio.patch('/api/v1/notifications/read-all');
              setState(() => _future = _load());
            },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: FutureBuilder(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return EmptyState(message: apiError(snap.error!), onRetry: () => setState(() => _future = _load()));
          }
          final items = snap.data ?? [];
          if (items.isEmpty) return const EmptyState(message: 'You are caught up');
          return RefreshIndicator(
            onRefresh: () async => setState(() => _future = _load()),
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final n = items[i];
                final read = n['isRead'] == true || n['read'] == true;
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
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    leading: CircleAvatar(
                      backgroundColor: read ? const Color(0xFFF1F5F9) : const Color(0xFFE0F2FE),
                      foregroundColor: read ? const Color(0xFF64748B) : const Color(0xFF0284C7),
                      child: const Icon(Icons.notifications_outlined, size: 20),
                    ),
                    title: Text(
                      '${n['title'] ?? n['type'] ?? 'Notification'}',
                      style: TextStyle(fontWeight: read ? FontWeight.w500 : FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${n['body'] ?? n['content'] ?? ''}',
                      style: const TextStyle(color: Color(0xFF64748B)),
                    ),
                    onTap: () async {
                      final id = n['id'];
                      if (id != null) {
                        await ref.read(apiClientProvider).dio.patch('/api/v1/notifications/$id/read');
                        setState(() => _future = _load());
                      }
                    },
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
