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
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: items.length,
            itemBuilder: (context, i) {
              final m = items[i];
              final name = m['conversation']?['group']?['name'] as String? ??
                  m['sender']?['profile']?['displayName'] as String? ??
                  'Call';
              final cid = m['conversationId'] as String?;
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
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFFDCFCE7),
                    foregroundColor: const Color(0xFF16A34A),
                    child: const Icon(Icons.call_rounded, size: 20),
                  ),
                  title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    '${m['content'] ?? m['messageType'] ?? ''} · ${m['createdAt'] ?? ''}',
                    style: const TextStyle(color: Color(0xFF64748B)),
                  ),
                  trailing: cid == null
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.videocam_rounded, color: Color(0xFF0284C7)),
                          onPressed: () => ref.read(callControllerProvider.notifier).invite(
                                conversationId: cid,
                                conversationName: name,
                                conversationType: '${m['conversation']?['type'] ?? 'GROUP'}',
                              ),
                        ),
                  onTap: cid == null
                      ? null
                      : () => context.push('/chat/$cid?title=${Uri.encodeComponent(name)}&type=${m['conversation']?['type'] ?? 'GROUP'}'),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
