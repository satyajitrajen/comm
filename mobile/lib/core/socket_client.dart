import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'auth_notifier.dart';

enum SocketStatus { idle, connecting, connected, reconnecting, disconnected }

class TeamTimeSocket {
  TeamTimeSocket({
    required this.baseUrl,
    required this.tokenProvider,
    this.onStatus,
  });

  final String baseUrl;
  final Future<String?> Function() tokenProvider;
  final void Function(SocketStatus status)? onStatus;
  final List<void Function(io.Socket socket)> _binders = [];
  io.Socket? _socket;
  bool _disposed = false;

  io.Socket? get socket => _socket;

  void Function() onSocket(void Function(io.Socket socket) binder) {
    final socket = _socket;
    if (socket != null) {
      binder(socket);
      return () {};
    }
    _binders.add(binder);
    return () => _binders.remove(binder);
  }

  Future<io.Socket?> connect() async {
    if (_disposed || _socket != null) return _socket;
    _setStatus(SocketStatus.connecting);
    final token = await tokenProvider();
    if (token == null || _disposed) return null;
    final socket = io.io(
      baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableForceNew()
          .setReconnectionAttempts(double.infinity)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(15000)
          .setAuthFn(_resolveAuth)
          .build(),
    );
    _socket = socket;
    socket.on('connect', (_) => _setStatus(SocketStatus.connected));
    socket.on('disconnect', (_) => _setStatus(SocketStatus.disconnected));
    socket.io.on('reconnect_attempt', (_) => _setStatus(SocketStatus.reconnecting));
    for (final binder in _binders) {
      binder(socket);
    }
    _binders.clear();
    socket.connect();
    return socket;
  }

  void _resolveAuth(void Function(Map auth) ack) {
    unawaited(() async {
      String? token;
      try {
        token = await tokenProvider();
      } catch (_) {}
      ack({'token': token ?? ''});
    }());
  }

  void _setStatus(SocketStatus status) {
    if (_disposed) return;
    onStatus?.call(status);
  }

  void joinRoom(String conversationId) {
    _socket?.emit('room.join', {'conversationId': conversationId});
  }

  void leaveRoom(String conversationId) {
    _socket?.emit('room.leave', {'conversationId': conversationId});
  }

  void dispose() {
    _disposed = true;
    _binders.clear();
    _socket?.dispose();
    _socket = null;
  }
}

final socketStatusProvider = StateProvider<SocketStatus>((_) => SocketStatus.idle);

final socketClientProvider = Provider<TeamTimeSocket>((ref) {
  final loggedIn = ref.watch(authProvider.select((state) => state.isLoggedIn));
  final api = ref.watch(apiClientProvider);
  final session = ref.watch(sessionProvider);
  final socket = TeamTimeSocket(
    baseUrl: api.baseUrl,
    tokenProvider: () => session.accessToken,
    onStatus: (status) => ref.read(socketStatusProvider.notifier).state = status,
  );
  ref.onDispose(socket.dispose);
  if (loggedIn) {
    unawaited(socket.connect());
  }
  return socket;
});
