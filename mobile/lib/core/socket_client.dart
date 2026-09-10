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
  bool _connecting = false;
  int _serverDisconnectRetries = 0;
  Timer? _reconnectTimer;
  static const _maxServerDisconnectRetries = 5;

  io.Socket? get socket => _socket;

  /// Registers a callback that receives the active socket instance.
  /// Returns an unbind function to safely remove the binder callback.
  void Function() onSocket(void Function(io.Socket socket) binder) {
    if (_disposed) return () {};
    _binders.add(binder);
    final socket = _socket;
    if (socket != null) {
      binder(socket);
    }
    return () {
      _binders.remove(binder);
    };
  }

  Future<io.Socket?> connect() async {
    if (_disposed) return null;
    final existing = _socket;
    if (existing != null && (existing.connected || _connecting)) {
      return existing;
    }
    _connecting = true;
    _setStatus(SocketStatus.connecting);
    final token = await tokenProvider();
    if (token == null || _disposed) {
      _connecting = false;
      _setStatus(SocketStatus.disconnected);
      return null;
    }

    if (_socket != null) {
      _socket?.dispose();
      _socket = null;
    }

    final socket = io.io(
      baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(15000)
          .setRandomizationFactor(0.2)
          .setAuth({'token': token})
          .build(),
    );
    _socket = socket;

    socket.on('connect', (_) {
      _connecting = false;
      _serverDisconnectRetries = 0;
      _setStatus(SocketStatus.connected);
      for (final binder in List.of(_binders)) {
        if (!_disposed && _socket == socket) {
          binder(socket);
        }
      }
    });

    socket.on('connect_error', (_) {
      _setStatus(SocketStatus.reconnecting);
    });

    socket.on('disconnect', (reason) {
      _connecting = false;
      _setStatus(SocketStatus.disconnected);
      if (reason == 'io server disconnect' && !_disposed && _socket == socket) {
        _scheduleServerDisconnectReconnect();
      }
    });

    socket.io.on('reconnect_attempt', (_) async {
      _setStatus(SocketStatus.reconnecting);
      final freshToken = await tokenProvider();
      if (freshToken != null && _socket == socket) {
        socket.auth = {'token': freshToken};
      }
    });

    socket.io.on('reconnect', (_) {
      _setStatus(SocketStatus.connected);
      for (final binder in List.of(_binders)) {
        if (!_disposed && _socket == socket) {
          binder(socket);
        }
      }
    });

    socket.connect();
    _connecting = false;
    return socket;
  }

  /// The server force-disconnects on auth failure; retrying unguarded here
  /// would loop forever with an expired token, so this is capped and backed
  /// off. A successful connect resets the counter.
  void _scheduleServerDisconnectReconnect() {
    if (_serverDisconnectRetries >= _maxServerDisconnectRetries) {
      return;
    }
    _serverDisconnectRetries++;
    _reconnectTimer?.cancel();
    final delay = Duration(seconds: 3 * _serverDisconnectRetries);
    _reconnectTimer = Timer(delay, () {
      if (!_disposed) connect();
    });
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

  void disconnect() {
    _reconnectTimer?.cancel();
    _socket?.disconnect();
    _setStatus(SocketStatus.disconnected);
  }

  void dispose() {
    _disposed = true;
    _binders.clear();
    _reconnectTimer?.cancel();
    _socket?.dispose();
    _socket = null;
  }
}

final socketStatusProvider = StateProvider<SocketStatus>((_) => SocketStatus.idle);

final socketClientProvider = Provider<TeamTimeSocket>((ref) {
  final isLoggedIn = ref.watch(authProvider.select((state) => state.isLoggedIn));
  final api = ref.read(apiClientProvider);
  final session = ref.read(sessionProvider);

  final socket = TeamTimeSocket(
    baseUrl: api.baseUrl,
    tokenProvider: () => session.accessToken,
    onStatus: (status) {
      Future.microtask(() {
        ref.read(socketStatusProvider.notifier).state = status;
      });
    },
  );

  ref.onDispose(socket.dispose);

  if (isLoggedIn) {
    Future.microtask(() => socket.connect());
  }

  return socket;
});
