import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../core/auth_notifier.dart';
import '../../core/socket_client.dart';
import '../../widgets/common.dart';
import '../calls/call_controller.dart';

class ConversationScreen extends ConsumerStatefulWidget {
  const ConversationScreen({
    super.key,
    required this.conversationId,
    required this.title,
    this.type = 'GROUP',
  });

  final String conversationId;
  final String title;
  final String type;

  @override
  ConsumerState<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends ConsumerState<ConversationScreen> {
  final _composer = TextEditingController();
  final _scroll = ScrollController();
  final _messages = <Map<String, dynamic>>[];
  io.Socket? _socket;
  bool _loading = true;
  String? _error;
  String? _nextCursor;
  bool _hasMore = false;
  String? _replyToId;

  String? get _me => ref.read(authProvider).user?['id'] as String?;

  @override
  void initState() {
    super.initState();
    _load();
    _bindSocket();
  }

  @override
  void dispose() {
    _composer.dispose();
    _scroll.dispose();
    _socket?.emit('room.leave', {'conversationId': widget.conversationId});
    _socket?.dispose();
    super.dispose();
  }

  Future<void> _bindSocket() async {
    final api = ref.read(apiClientProvider);
    final token = await ref.read(sessionProvider).accessToken;
    if (token == null) return;
    final client = TeamTimeSocket(baseUrl: api.baseUrl, token: token);
    final socket = client.connect();
    socket.on('connect', (_) {
      socket.emit('room.join', {'conversationId': widget.conversationId});
    });
    socket.on('message.sent', (data) {
      if (data is Map && data['conversationId'] == widget.conversationId) {
        setState(() => _upsert(Map<String, dynamic>.from(data)));
      }
    });
    socket.on('message.edited', (data) {
      if (data is Map) _upsert(Map<String, dynamic>.from(data));
    });
    socket.on('message.deleted', (data) {
      if (data is Map && data['id'] != null) {
        setState(() => _messages.removeWhere((m) => m['id'] == data['id']));
      }
    });
    _socket = socket;
  }

  void _upsert(Map<String, dynamic> msg) {
    final i = _messages.indexWhere((m) => m['id'] == msg['id']);
    if (i >= 0) {
      _messages[i] = msg;
    } else {
      _messages.add(msg);
    }
    setState(() {});
  }

  Future<void> _load({bool older = false}) async {
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.dio.get(
        '/api/v1/chats/${widget.conversationId}/messages',
        queryParameters: {
          'limit': 50,
          if (older && _nextCursor != null) 'before': _nextCursor,
        },
      );
      final data = res.data as Map;
      final list = (data['messages'] as List? ?? []).cast<dynamic>();
      final mapped = list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      setState(() {
        if (older) {
          _messages.insertAll(0, mapped);
        } else {
          _messages
            ..clear()
            ..addAll(mapped);
        }
        _hasMore = data['hasMore'] == true;
        _nextCursor = data['nextCursor'] as String?;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = apiError(e);
      });
    }
  }

  Future<void> _send() async {
    final text = _composer.text.trim();
    if (text.isEmpty) return;
    _composer.clear();
    try {
      await ref.read(apiClientProvider).dio.post(
        '/api/v1/messages',
        data: {
          'conversationId': widget.conversationId,
          'content': text,
          if (_replyToId != null) 'replyToMessageId': _replyToId,
        },
      );
      setState(() => _replyToId = null);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    }
  }

  Future<void> _attach() async {
    final result = await FilePicker.platform.pickFiles();
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    if (file.path == null) return;
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path!, filename: file.name),
      'conversationId': widget.conversationId,
    });
    try {
      await ref.read(apiClientProvider).dio.post('/api/v1/files', data: form);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    }
  }

  Future<void> _action(String id, String action, {String? extra}) async {
    final dio = ref.read(apiClientProvider).dio;
    try {
      switch (action) {
        case 'star':
          await dio.post('/api/v1/messages/$id/star');
        case 'pin':
          await dio.post('/api/v1/messages/$id/pin', data: {'conversationId': widget.conversationId});
        case 'delete':
          await dio.delete('/api/v1/messages/$id', queryParameters: {'everyone': true});
        case 'react':
          await dio.post('/api/v1/messages/$id/react', data: {'emoji': extra ?? '👍'});
        case 'edit':
          if (extra != null) await dio.put('/api/v1/messages/$id', data: {'content': extra});
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    }
  }

  Future<void> _createPoll() async {
    final q = TextEditingController();
    final o1 = TextEditingController();
    final o2 = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create poll'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: q, decoration: const InputDecoration(labelText: 'Question')),
            TextField(controller: o1, decoration: const InputDecoration(labelText: 'Option 1')),
            TextField(controller: o2, decoration: const InputDecoration(labelText: 'Option 2')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(apiClientProvider).dio.post('/api/v1/messages/poll', data: {
      'conversationId': widget.conversationId,
      'question': q.text.trim(),
      'options': [o1.text.trim(), o2.text.trim()].where((e) => e.isNotEmpty).toList(),
    });
  }

  Future<void> _createTask() async {
    if (_messages.isEmpty) return;
    final title = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Create task from last message'),
        content: TextField(controller: title, decoration: const InputDecoration(labelText: 'Title')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Create')),
        ],
      ),
    );
    if (ok != true || title.text.trim().isEmpty) return;
    await ref.read(apiClientProvider).dio.post('/api/v1/messages/task', data: {
      'messageId': _messages.last['id'],
      'title': title.text.trim(),
      'assigneeIds': [_me].whereType<String>().toList(),
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: 'Start call',
            onPressed: () => ref.read(callControllerProvider.notifier).invite(
                  conversationId: widget.conversationId,
                  conversationName: widget.title,
                  conversationType: widget.type,
                  socket: _socket,
                ),
            icon: const Icon(Icons.videocam_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_hasMore)
            TextButton(onPressed: () => _load(older: true), child: const Text('Load older')),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? EmptyState(message: _error!, onRetry: _load)
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(12),
                        itemCount: _messages.length,
                        itemBuilder: (context, i) {
                          final m = _messages[i];
                          final mine = m['senderId'] == _me;
                          return _bubble(m, mine);
                        },
                      ),
          ),
          if (_replyToId != null)
            ListTile(
              dense: true,
              title: const Text('Replying'),
              trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => setState(() => _replyToId = null)),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
              child: Row(
                children: [
                  IconButton(onPressed: _plus, icon: const Icon(Icons.add)),
                  Expanded(
                    child: TextField(
                      controller: _composer,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(hintText: 'Message'),
                    ),
                  ),
                  IconButton(onPressed: _send, icon: const Icon(Icons.send)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _plus() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(leading: const Icon(Icons.attach_file), title: const Text('Attach file'), onTap: () {
              Navigator.pop(ctx);
              _attach();
            }),
            ListTile(leading: const Icon(Icons.poll_outlined), title: const Text('Poll'), onTap: () {
              Navigator.pop(ctx);
              _createPoll();
            }),
            ListTile(leading: const Icon(Icons.task_alt), title: const Text('Task'), onTap: () {
              Navigator.pop(ctx);
              _createTask();
            }),
          ],
        ),
      ),
    );
  }

  Widget _bubble(Map<String, dynamic> m, bool mine) {
    final sender = m['sender'] as Map?;
    final name = sender?['profile']?['displayName'] as String? ?? 'User';
    final content = m['content'] as String? ?? '';
    final created = DateTime.tryParse(m['createdAt']?.toString() ?? '');
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onLongPress: () => _sheet(m, mine),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.all(12),
          constraints: const BoxConstraints(maxWidth: 320),
          decoration: BoxDecoration(
            color: mine ? const Color(0xFF0284C7) : Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 6)],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!mine)
                Text(name, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF64748B))),
              Text(content, style: TextStyle(color: mine ? Colors.white : const Color(0xFF020617))),
              ..._polls(m),
              if (created != null)
                Text(
                  DateFormat.Hm().format(created.toLocal()),
                  style: TextStyle(fontSize: 10, color: mine ? Colors.white70 : const Color(0xFF64748B)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _polls(Map<String, dynamic> m) {
    final polls = m['polls'];
    if (polls is! List) return [];
    return polls.map((raw) {
      final poll = Map<String, dynamic>.from(raw as Map);
      final options = (poll['options'] as List? ?? []).map((o) => Map<String, dynamic>.from(o as Map));
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${poll['question'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
          ...options.map(
            (opt) => TextButton(
              onPressed: () async {
                final id = poll['id'];
                if (id == null) return;
                await ref.read(apiClientProvider).dio.post(
                  '/api/v1/messages/poll/$id/vote',
                  data: {'optionId': opt['id']},
                );
              },
              child: Text('${opt['text'] ?? opt['label'] ?? 'Option'}'),
            ),
          ),
        ],
      );
    }).toList();
  }

  void _sheet(Map<String, dynamic> m, bool mine) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(title: const Text('Reply'), onTap: () {
              Navigator.pop(ctx);
              setState(() => _replyToId = m['id'] as String?);
            }),
            ListTile(title: const Text('React 👍'), onTap: () {
              Navigator.pop(ctx);
              _action(m['id'] as String, 'react');
            }),
            ListTile(title: const Text('Star'), onTap: () {
              Navigator.pop(ctx);
              _action(m['id'] as String, 'star');
            }),
            ListTile(title: const Text('Pin'), onTap: () {
              Navigator.pop(ctx);
              _action(m['id'] as String, 'pin');
            }),
            if (mine)
              ListTile(title: const Text('Delete'), onTap: () {
                Navigator.pop(ctx);
                _action(m['id'] as String, 'delete');
              }),
          ],
        ),
      ),
    );
  }
}
