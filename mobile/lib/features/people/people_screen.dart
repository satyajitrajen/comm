import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';

class PeopleScreen extends ConsumerStatefulWidget {
  const PeopleScreen({super.key});
  @override
  ConsumerState<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends ConsumerState<PeopleScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  String _q = '';

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final res = await ref.read(apiClientProvider).dio.get('/api/v1/users/directory');
    final data = res.data;
    final list = data is List ? data : (data is Map && data['users'] is List ? data['users'] as List : []);
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _dm(String userId, String name) async {
    final res = await ref.read(apiClientProvider).dio.post('/api/v1/chats/direct', data: {'targetUserId': userId});
    final id = (res.data as Map)['id'] ?? (res.data as Map)['conversationId'];
    if (!mounted) return;
    context.push('/chat/$id?title=${Uri.encodeComponent(name)}&type=DIRECT');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('People')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              decoration: const InputDecoration(hintText: 'Search'),
              onChanged: (v) => setState(() => _q = v.toLowerCase()),
            ),
          ),
          Expanded(
            child: FutureBuilder(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return EmptyState(message: apiError(snap.error!), onRetry: () => setState(() => _future = _load()));
                }
                final me = ref.read(authProvider).user?['id'];
                final items = (snap.data ?? []).where((u) {
                  if (u['id'] == me) return false;
                  final name = '${u['displayName'] ?? u['profile']?['displayName'] ?? ''}'.toLowerCase();
                  return _q.isEmpty || name.contains(_q);
                }).toList();
                if (items.isEmpty) return const EmptyState(message: 'No people found');
                return ListView.builder(
                  itemCount: items.length,
                  itemBuilder: (context, i) {
                    final u = items[i];
                    final name = u['displayName'] as String? ?? u['profile']?['displayName'] as String? ?? 'User';
                    return ListTile(
                      leading: TtAvatar(name: name, url: u['avatarUrl'] as String? ?? u['profile']?['avatarUrl'] as String?),
                      title: Text(name),
                      subtitle: Text('${u['email'] ?? u['department'] ?? ''}'),
                      trailing: const Icon(Icons.chat_bubble_outline),
                      onTap: () => _dm('${u['id']}', name),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
