import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';
import 'call_controller.dart';

class CallsScreen extends ConsumerStatefulWidget {
  const CallsScreen({super.key});
  @override
  ConsumerState<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends ConsumerState<CallsScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final res = await ref.read(apiClientProvider).dio.get('/api/v1/messages/call-history');
    final data = res.data;
    final list = data is Map && data['messages'] is List ? data['messages'] as List : [];
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Calls')),
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
          if (items.isEmpty) return const EmptyState(message: 'No call history yet. Start one from a chat.');
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, i) {
              final m = items[i];
              final name = m['conversation']?['group']?['name'] as String? ??
                  m['sender']?['profile']?['displayName'] as String? ??
                  'Call';
              final cid = m['conversationId'] as String?;
              return ListTile(
                leading: const Icon(Icons.call),
                title: Text(name),
                subtitle: Text('${m['content'] ?? m['messageType'] ?? ''} · ${m['createdAt'] ?? ''}'),
                trailing: cid == null
                    ? null
                    : IconButton(
                        icon: const Icon(Icons.videocam),
                        onPressed: () => ref.read(callControllerProvider.notifier).invite(
                              conversationId: cid,
                              conversationName: name,
                              conversationType: '${m['conversation']?['type'] ?? 'GROUP'}',
                            ),
                      ),
                onTap: cid == null
                    ? null
                    : () => context.push('/chat/$cid?title=${Uri.encodeComponent(name)}&type=${m['conversation']?['type'] ?? 'GROUP'}'),
              );
            },
          );
        },
      ),
    );
  }
}
