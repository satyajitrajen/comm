import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../core/auth_notifier.dart';
import '../../core/config.dart';
import '../../core/file_downloader.dart';
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
  final Set<String> _downloadingFileIds = {};
  io.Socket? _socket;
  void Function()? _unbind;
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
    _unbind?.call();
    _detachSocket(_socket);
    _socket = null;
    super.dispose();
  }

  void _bindSocket() {
    final client = ref.read(socketClientProvider);
    _unbind = client.onSocket(_onSocketReady);
  }

  void _detachSocket(io.Socket? socket) {
    if (socket == null) return;
    socket
      ..off('connect', _onConnect)
      ..off('message.sent', _onSent)
      ..off('message.edited', _onEdited)
      ..off('message.deleted', _onDeleted)
      ..off('poll.created', _onSent)
      ..off('poll.voted', _onEdited);
    socket.emit('room.leave', {'conversationId': widget.conversationId});
  }

  void _onSocketReady(io.Socket socket) {
    if (identical(_socket, socket)) {
      if (socket.connected) _onConnect(null);
      return;
    }
    _detachSocket(_socket);
    _socket = socket;
    socket
      ..on('connect', _onConnect)
      ..on('message.sent', _onSent)
      ..on('message.edited', _onEdited)
      ..on('message.deleted', _onDeleted)
      ..on('poll.created', _onSent)
      ..on('poll.voted', _onEdited);
    if (socket.connected) _onConnect(null);
  }

  void _onConnect(dynamic _) {
    _socket?.emit('room.join', {'conversationId': widget.conversationId});
  }

  void _onSent(dynamic data) {
    if (!mounted) return;
    if (data is Map && data['conversationId'] == widget.conversationId) {
      final map = Map<String, dynamic>.from(data);
      _upsert(map);
      final msgType = (map['messageType'] as String? ?? '').toUpperCase();
      final senderId = map['senderId']?.toString();
      if (msgType == 'SYSTEM_CALL_START' && senderId != _me) {
        final sender = map['sender'] as Map?;
        final callerName = sender?['profile']?['displayName'] as String? ?? 'User';
        ref.read(callControllerProvider.notifier).handleIncomingCallStart(
              conversationId: widget.conversationId,
              conversationName: widget.title,
              callerName: callerName,
              callerId: senderId ?? '',
              conversationType: widget.type,
            );
      } else if (msgType == 'SYSTEM_CALL_END' || msgType == 'SYSTEM_CALL_DECLINE') {
        ref.read(callControllerProvider.notifier).dismissIncoming();
      }
    }
  }

  void _onEdited(dynamic data) {
    if (!mounted) return;
    if (data is Map) _upsert(Map<String, dynamic>.from(data));
  }

  void _onDeleted(dynamic data) {
    if (!mounted) return;
    if (data is Map && data['id'] != null) {
      setState(() => _messages.removeWhere((m) => m['id'] == data['id']));
    }
  }

  void _upsert(Map<String, dynamic> msg) {
    if (!mounted) return;
    setState(() {
      final i = _messages.indexWhere((m) => m['id'] == msg['id']);
      if (i >= 0) {
        _messages[i] = msg;
      } else {
        _messages.add(msg);
      }
    });
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
      await _load();
      Future.delayed(const Duration(milliseconds: 150), () {
        if (mounted && _scroll.hasClients) {
          _scroll.animateTo(
            _scroll.position.maxScrollExtent + 100,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
          );
        }
      });
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

  void _joinActiveCall() {
    final me = ref.read(authProvider).user;
    final room = callRoomName(widget.conversationId);
    ref.read(callControllerProvider.notifier).joinCall(
          conversationId: widget.conversationId,
          conversationName: widget.title,
          roomName: room,
          displayName: me?['displayName'] as String?,
        );
  }

  bool _hasActiveCall() {
    for (int i = _messages.length - 1; i >= 0; i--) {
      final msg = _messages[i];
      final type = (msg['messageType'] as String? ?? '').toUpperCase();
      final text = (msg['content'] as String? ?? '').toLowerCase();

      if (type == 'SYSTEM_CALL_START' || text.contains('started a video call')) {
        return true;
      }
      if (type == 'SYSTEM_CALL_END' ||
          type == 'SYSTEM_CALL_DECLINE' ||
          text.contains('ended the video call') ||
          text.contains('cancelled the call') ||
          text.contains('declined')) {
        return false;
      }
    }
    return false;
  }

  bool _isCallStartActive(int messageIndex) {
    final msg = _messages[messageIndex];
    final type = (msg['messageType'] as String? ?? '').toUpperCase();
    final content = (msg['content'] as String? ?? '').toLowerCase();
    final isStart = type == 'SYSTEM_CALL_START' || content.contains('started a video call');
    if (!isStart) return false;

    for (int j = messageIndex + 1; j < _messages.length; j++) {
      final next = _messages[j];
      final nextType = (next['messageType'] as String? ?? '').toUpperCase();
      final nextText = (next['content'] as String? ?? '').toLowerCase();

      if (nextType == 'SYSTEM_CALL_END' ||
          nextType == 'SYSTEM_CALL_DECLINE' ||
          nextType == 'SYSTEM_CALL_START' ||
          nextText.contains('ended the video call') ||
          nextText.contains('cancelled the call') ||
          nextText.contains('declined') ||
          nextText.contains('started a video call')) {
        return false;
      }
    }
    return true;
  }

  Widget _buildActiveCallBanner() {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(14, 8, 14, 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF047857), Color(0xFF10B981)],
        ),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF10B981).withValues(alpha: 0.35),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.25),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.videocam_rounded, color: Colors.white, size: 20),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Video Call in Progress',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
                Text(
                  'Meeting is live right now • Tap to join',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: const Color(0xFF047857),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              shape: const StadiumBorder(),
              elevation: 0,
            ),
            onPressed: _joinActiveCall,
            child: const Text(
              'Join',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeCall = _hasActiveCall();

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title),
        actions: [
          IconButton(
            tooltip: activeCall ? 'Join ongoing call' : 'Start call',
            onPressed: () {
              if (activeCall) {
                _joinActiveCall();
              } else {
                ref.read(callControllerProvider.notifier).invite(
                      conversationId: widget.conversationId,
                      conversationName: widget.title,
                      conversationType: widget.type,
                    );
              }
            },
            icon: activeCall
                ? Container(
                    padding: const EdgeInsets.all(5),
                    decoration: const BoxDecoration(
                      color: Color(0xFF10B981),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.videocam_rounded, color: Colors.white, size: 18),
                  )
                : const Icon(Icons.videocam_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          if (activeCall) _buildActiveCallBanner(),
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
                          return _bubble(m, mine, i);
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
            child: Container(
              margin: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(28),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x14000000),
                    blurRadius: 12,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  IconButton(
                    onPressed: _plus,
                    icon: const Icon(Icons.add_circle_outline_rounded, color: Color(0xFF0284C7)),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _composer,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        hintText: 'Message…',
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        filled: false,
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                    ),
                  ),
                  Material(
                    color: const Color(0xFF0284C7),
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: _send,
                      child: const Padding(
                        padding: EdgeInsets.all(10),
                        child: Icon(Icons.arrow_upward_rounded, size: 20, color: Colors.white),
                      ),
                    ),
                  ),
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
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFFE2E8F0),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              ListTile(
                leading: const Icon(Icons.attach_file_rounded, color: Color(0xFF0284C7)),
                title: const Text('Attach file', style: TextStyle(fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.pop(ctx);
                  _attach();
                },
              ),
              ListTile(
                leading: const Icon(Icons.poll_outlined, color: Color(0xFF0284C7)),
                title: const Text('Poll', style: TextStyle(fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.pop(ctx);
                  _createPoll();
                },
              ),
              ListTile(
                leading: const Icon(Icons.task_alt_rounded, color: Color(0xFF0284C7)),
                title: const Text('Task', style: TextStyle(fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.pop(ctx);
                  _createTask();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatFileSize(dynamic rawBytes) {
    if (rawBytes == null) return '';
    final bytes = int.tryParse(rawBytes.toString()) ?? 0;
    if (bytes <= 0) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  IconData _fileIcon(String mime) {
    if (mime.contains('pdf')) return Icons.picture_as_pdf_rounded;
    if (mime.contains('image')) return Icons.image_rounded;
    if (mime.contains('video')) return Icons.videocam_rounded;
    if (mime.contains('audio')) return Icons.audio_file_rounded;
    if (mime.contains('zip') || mime.contains('compressed') || mime.contains('tar') || mime.contains('rar')) {
      return Icons.folder_zip_rounded;
    }
    if (mime.contains('word') || mime.contains('document') || mime.contains('text') || mime.contains('sheet')) {
      return Icons.description_rounded;
    }
    return Icons.insert_drive_file_rounded;
  }

  void _viewFullImage(String url, String filename) {
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  tooltip: 'Download image',
                  icon: const Icon(Icons.download_rounded, color: Colors.white, size: 28),
                  onPressed: () {
                    final api = ref.read(apiClientProvider);
                    FileDownloader.downloadAndOpen(
                      context,
                      filename: filename,
                      url: url,
                      api: api,
                    );
                  },
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white, size: 28),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: InteractiveViewer(
                child: Image.network(
                  url,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) => Container(
                    padding: const EdgeInsets.all(24),
                    color: Colors.white,
                    child: Text('Failed to load $filename'),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _renderAttachment(Map<String, dynamic> a, bool mine) {
    final file = (a['file'] as Map?) ?? a;
    final fileId = file['id']?.toString() ?? '';
    final filename = file['filename'] as String? ?? file['originalName'] as String? ?? 'Attachment';
    final mimeType = (file['mimeType'] as String? ?? '').toLowerCase();
    final isImage = mimeType.startsWith('image/') ||
        filename.toLowerCase().endsWith('.png') ||
        filename.toLowerCase().endsWith('.jpg') ||
        filename.toLowerCase().endsWith('.jpeg') ||
        filename.toLowerCase().endsWith('.gif') ||
        filename.toLowerCase().endsWith('.webp');
    final baseUrl = ref.read(apiClientProvider).baseUrl;
    final viewUrl = '$baseUrl/api/v1/files/$fileId/view';
    final fileSize = _formatFileSize(file['fileSizeBytes']);

    if (isImage && fileId.isNotEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: GestureDetector(
            onTap: () => _viewFullImage(viewUrl, filename),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220, maxWidth: 280),
              child: Image.network(
                viewUrl,
                fit: BoxFit.cover,
                loadingBuilder: (context, child, progress) {
                  if (progress == null) return child;
                  return Container(
                    height: 140,
                    width: 200,
                    color: mine ? Colors.white12 : const Color(0xFFF1F5F9),
                    child: const Center(
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  );
                },
                errorBuilder: (context, error, stackTrace) {
                  return _fileCard(filename, fileSize, mimeType, mine, fileId);
                },
              ),
            ),
          ),
        ),
      );
    }

    return _fileCard(filename, fileSize, mimeType, mine, fileId);
  }

  Widget _fileCard(String filename, String fileSize, String mimeType, bool mine, String fileId) {
    final isDownloading = _downloadingFileIds.contains(fileId);
    final downloadUrl = '/api/v1/files/$fileId/download';

    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: fileId.isEmpty || isDownloading
          ? null
          : () async {
              setState(() => _downloadingFileIds.add(fileId));
              final api = ref.read(apiClientProvider);
              try {
                await FileDownloader.downloadAndOpen(
                  context,
                  filename: filename,
                  url: downloadUrl,
                  api: api,
                );
              } finally {
                if (mounted) {
                  setState(() => _downloadingFileIds.remove(fileId));
                }
              }
            },
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: mine ? Colors.white.withValues(alpha: 0.18) : const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: mine ? Colors.white30 : const Color(0xFFE2E8F0),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: mine ? Colors.white.withValues(alpha: 0.2) : const Color(0xFFE0F2FE),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                _fileIcon(mimeType),
                size: 22,
                color: mine ? Colors.white : const Color(0xFF0284C7),
              ),
            ),
            const SizedBox(width: 10),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    filename,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      color: mine ? Colors.white : const Color(0xFF0F172A),
                    ),
                  ),
                  if (fileSize.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      fileSize,
                      style: TextStyle(
                        fontSize: 11,
                        color: mine ? Colors.white70 : const Color(0xFF64748B),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (isDownloading)
              SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation(
                    mine ? Colors.white : const Color(0xFF0284C7),
                  ),
                ),
              )
            else
              Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: mine ? Colors.white.withValues(alpha: 0.22) : const Color(0xFFE2E8F0),
                ),
                child: Icon(
                  Icons.download_rounded,
                  size: 18,
                  color: mine ? Colors.white : const Color(0xFF0284C7),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _callCard(Map<String, dynamic> m, bool mine, int index) {
    final content = m['content'] as String? ?? 'Video call';
    final lower = content.toLowerCase();
    final type = (m['messageType'] as String? ?? '').toUpperCase();
    final isStart = type == 'SYSTEM_CALL_START' || lower.contains('started a video call');
    final isEnded = type == 'SYSTEM_CALL_END' || lower.contains('ended');
    final isDeclined = type == 'SYSTEM_CALL_DECLINE' || lower.contains('declined');
    final isCancelled = lower.contains('cancelled');
    final isActive = isStart && _isCallStartActive(index);

    if (!isActive && (isEnded || isDeclined || isCancelled)) {
      Color bg = const Color(0xFFF1F5F9);
      Color textCol = const Color(0xFF64748B);
      IconData icon = Icons.call_end_rounded;
      if (isDeclined) {
        bg = const Color(0xFFFFE4E6);
        textCol = const Color(0xFFE11D48);
        icon = Icons.phone_missed_rounded;
      } else if (isCancelled) {
        bg = const Color(0xFFFEF3C7);
        textCol = const Color(0xFFB45309);
        icon = Icons.phone_missed_rounded;
      }

      return Center(
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 6),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: textCol.withValues(alpha: 0.2)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 14, color: textCol),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  content,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: textCol,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: isActive
            ? const LinearGradient(
                colors: [Color(0xFF047857), Color(0xFF10B981)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : null,
        color: isActive
            ? null
            : (mine ? Colors.white.withValues(alpha: 0.16) : const Color(0xFFF1F5F9)),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isActive
              ? const Color(0xFF34D399)
              : (mine ? Colors.white30 : const Color(0xFFE2E8F0)),
        ),
        boxShadow: isActive
            ? [
                BoxShadow(
                  color: const Color(0xFF10B981).withValues(alpha: 0.35),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ]
            : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isActive
                      ? Colors.white.withValues(alpha: 0.25)
                      : (mine ? Colors.white24 : const Color(0xFF94A3B8)),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isActive ? Icons.videocam_rounded : Icons.call_end_rounded,
                  size: 22,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      isActive ? 'Active Video Call' : 'Video Call',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: (isActive || mine) ? Colors.white : const Color(0xFF0F172A),
                      ),
                    ),
                    Text(
                      content,
                      style: TextStyle(
                        fontSize: 12,
                        color: (isActive || mine)
                            ? Colors.white.withValues(alpha: 0.85)
                            : const Color(0xFF64748B),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (isActive) ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF047857),
                  shape: const StadiumBorder(),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  elevation: 2,
                ),
                icon: const Icon(Icons.videocam_rounded, size: 20),
                label: const Text(
                  'Join Call',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                ),
                onPressed: _joinActiveCall,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _bubble(Map<String, dynamic> m, bool mine, int index) {
    final sender = m['sender'] as Map?;
    final name = sender?['profile']?['displayName'] as String? ?? 'User';
    final content = m['content'] as String? ?? '';
    final created = DateTime.tryParse(m['createdAt']?.toString() ?? '');
    final attachments = (m['attachments'] as List? ?? [])
        .map((a) => Map<String, dynamic>.from(a as Map))
        .toList();
    final isFileMessage = m['messageType'] == 'FILE';
    final msgType = (m['messageType'] as String? ?? '').toUpperCase();
    final lower = content.toLowerCase();
    final isCallMessage = msgType.contains('CALL') ||
        lower.contains('started a video call') ||
        lower.contains('ended the video call') ||
        lower.contains('declined') ||
        lower.contains('cancelled the call');

    if (isCallMessage) {
      final isEnded = msgType == 'SYSTEM_CALL_END' || lower.contains('ended');
      final isDeclined = msgType == 'SYSTEM_CALL_DECLINE' || lower.contains('declined');
      final isCancelled = lower.contains('cancelled');
      final isActive = (msgType == 'SYSTEM_CALL_START' || lower.contains('started a video call')) &&
          _isCallStartActive(index);
      if (!isActive && (isEnded || isDeclined || isCancelled)) {
        return _callCard(m, mine, index);
      }
      return Align(
        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 320),
          child: _callCard(m, mine, index),
        ),
      );
    }

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
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    name,
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF64748B)),
                  ),
                ),
              if (attachments.isNotEmpty) ...[
                ...attachments.map((a) => _renderAttachment(a, mine)),
                if (content.isNotEmpty) const SizedBox(height: 6),
              ],
                if (content.isNotEmpty)
                  Text(
                    content,
                    style: TextStyle(
                      fontSize: 15,
                      color: mine ? Colors.white : const Color(0xFF020617),
                    ),
                  )
                else if (attachments.isEmpty && (m['polls'] == null))
                  Text(
                    isFileMessage ? '📎 Shared a file' : '(message)',
                    style: TextStyle(
                      fontSize: 14,
                      fontStyle: FontStyle.italic,
                      color: mine ? Colors.white70 : const Color(0xFF64748B),
                    ),
                  ),
              ..._polls(m),
              if (created != null) ...[
                const SizedBox(height: 4),
                Text(
                  DateFormat.Hm().format(created.toLocal()),
                  style: TextStyle(fontSize: 10, color: mine ? Colors.white70 : const Color(0xFF64748B)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _polls(Map<String, dynamic> m) {
    final rawPoll = m['polls'];
    if (rawPoll == null) return [];
    final poll = rawPoll is Map
        ? Map<String, dynamic>.from(rawPoll)
        : (rawPoll is List && rawPoll.isNotEmpty ? Map<String, dynamic>.from(rawPoll.first as Map) : null);
    if (poll == null) return [];
    final options = (poll['options'] as List? ?? [])
        .map((o) => Map<String, dynamic>.from(o as Map))
        .toList();
    final votes = (poll['votes'] as List? ?? [])
        .map((v) => Map<String, dynamic>.from(v as Map))
        .toList();
    final totalVotes = votes.length;
    final mine = m['senderId'] == _me;

    return [
      const SizedBox(height: 8),
      Text(
        '📊 ${poll['question'] ?? 'Poll'}',
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: mine ? Colors.white : const Color(0xFF0F172A),
        ),
      ),
      const SizedBox(height: 4),
      ...options.map((opt) {
        final optId = opt['id'];
        final optText = opt['optionText'] ?? opt['text'] ?? opt['label'] ?? 'Option';
        final optVotes = votes.where((v) => v['optionId'] == optId).length;
        final hasVotedThis = votes.any((v) => v['optionId'] == optId && v['userId'] == _me);
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: OutlinedButton(
            style: OutlinedButton.styleFrom(
              backgroundColor: hasVotedThis
                  ? (mine ? Colors.white24 : const Color(0xFFE0F2FE))
                  : null,
              side: BorderSide(
                color: mine ? Colors.white38 : const Color(0xFFCBD5E1),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            onPressed: () async {
              final pollId = poll['id'];
              if (pollId == null || optId == null) return;
              try {
                final res = await ref.read(apiClientProvider).dio.post(
                  '/api/v1/messages/poll/$pollId/vote',
                  data: {'optionId': optId},
                );
                if (res.data is Map) {
                  _upsert(Map<String, dynamic>.from(res.data as Map));
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(apiError(e))),
                  );
                }
              }
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Text(
                    optText.toString(),
                    style: TextStyle(
                      color: mine ? Colors.white : const Color(0xFF0F172A),
                      fontWeight: hasVotedThis ? FontWeight.bold : FontWeight.normal,
                    ),
                  ),
                ),
                Text(
                  '$optVotes',
                  style: TextStyle(
                    fontSize: 12,
                    color: mine ? Colors.white70 : const Color(0xFF64748B),
                  ),
                ),
              ],
            ),
          ),
        );
      }),
      if (totalVotes > 0)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            '$totalVotes vote${totalVotes == 1 ? '' : 's'} total',
            style: TextStyle(
              fontSize: 10,
              color: mine ? Colors.white70 : const Color(0xFF64748B),
            ),
          ),
        ),
      const SizedBox(height: 4),
    ];
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
