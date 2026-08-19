import 'package:socket_io_client/socket_io_client.dart' as io;

class TeamTimeSocket {
  TeamTimeSocket({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;
  io.Socket? _socket;

  io.Socket connect() {
    _socket?.dispose();
    final socket = io.io(
      baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableAutoConnect()
          .setAuth({'token': token})
          .build(),
    );
    _socket = socket;
    return socket;
  }

  void joinRoom(String conversationId) {
    _socket?.emit('room.join', {'conversationId': conversationId});
  }

  void leaveRoom(String conversationId) {
    _socket?.emit('room.leave', {'conversationId': conversationId});
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
  }
}
