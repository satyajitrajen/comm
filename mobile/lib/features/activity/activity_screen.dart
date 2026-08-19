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
              itemCount: items.length,
              itemBuilder: (context, i) {
                final n = items[i];
                return ListTile(
                  title: Text('${n['title'] ?? n['type'] ?? 'Notification'}'),
                  subtitle: Text('${n['body'] ?? n['content'] ?? ''}'),
                  onTap: () async {
                    final id = n['id'];
                    if (id != null) {
                      await ref.read(apiClientProvider).dio.patch('/api/v1/notifications/$id/read');
                    }
                  },
                );
              },
            ),
          );
        },
      ),
    );
  }
}
