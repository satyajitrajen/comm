import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jitsi_meet_flutter_sdk/jitsi_meet_flutter_sdk.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../core/auth_notifier.dart';
import '../../core/config.dart';
import '../../core/socket_client.dart';

class IncomingCall {
  IncomingCall({
    required this.conversationId,
    required this.roomName,
    required this.callerId,
    required this.callerName,
    required this.conversationName,
    this.conversationType,
  });

  final String conversationId;
  final String roomName;
  final String callerId;
  final String callerName;
  final String conversationName;
  final String? conversationType;
}

class CallUiState {
  const CallUiState({this.incoming, this.outgoingName, this.inCall = false});
  final IncomingCall? incoming;
  final String? outgoingName;
  final bool inCall;
}

class CallController extends Notifier<CallUiState> {
  final _jitsi = JitsiMeet();
  io.Socket? _socket;
  TeamTimeSocket? _client;

  @override
  CallUiState build() {
    final client = ref.watch(socketClientProvider);
    if (!identical(_client, client)) {
      _client = client;
      client.onSocket(_attach);
    }
    return const CallUiState();
  }

  void _attach(io.Socket socket) {
    if (identical(_socket, socket)) return;
    _socket = socket;
    socket
      ..on('call.incoming', _onIncoming)
      ..on('call.accepted', _onAccepted)
      ..on('call.declined', _onDeclined)
      ..on('call.ended', _onEnded)
      ..on('call.cancelled', _onCancelled);
  }

  void _onIncoming(dynamic data) {
    if (data is! Map) return;
    if (state.inCall) return;
    state = CallUiState(
      incoming: IncomingCall(
        conversationId: '${data['conversationId']}',
        roomName: '${data['roomName']}',
        callerId: '${data['callerId']}',
        callerName: '${data['callerName']}',
        conversationName: '${data['conversationName']}',
        conversationType: data['conversationType']?.toString(),
      ),
    );
  }

  void _onAccepted(dynamic _) => state = const CallUiState();
  void _onDeclined(dynamic _) => state = const CallUiState();
  void _onEnded(dynamic _) => state = const CallUiState();
  void _onCancelled(dynamic _) => state = const CallUiState();

  String? _activeConversationId;
  String? _activeRoomName;

  Future<void> invite({
    required String conversationId,
    required String conversationName,
    required String conversationType,
  }) async {
    final me = ref.read(authProvider).user;
    final room = callRoomName(conversationId);
    _socket?.emit('call.invite', {
      'conversationId': conversationId,
      'roomName': room,
      'callerName': (me?['displayName'] as String?) ?? 'User',
      'conversationName': conversationName,
      'conversationType': conversationType,
    });
    state = CallUiState(outgoingName: conversationName, inCall: false);
    await joinRoom(
      room,
      conversationId: conversationId,
      displayName: me?['displayName'] as String?,
    );
  }

  Future<void> accept() async {
    final incoming = state.incoming;
    if (incoming == null) return;
    _socket?.emit('call.accept', {
      'conversationId': incoming.conversationId,
      'callerId': incoming.callerId,
      'roomName': incoming.roomName,
    });
    final me = ref.read(authProvider).user;
    state = const CallUiState(inCall: true);
    await joinRoom(
      incoming.roomName,
      conversationId: incoming.conversationId,
      displayName: me?['displayName'] as String?,
    );
  }

  void decline() {
    final incoming = state.incoming;
    if (incoming != null) {
      _socket?.emit('call.decline', {
        'conversationId': incoming.conversationId,
        'callerId': incoming.callerId,
      });
    }
    state = const CallUiState();
  }

  void cancelOutgoing(String conversationId) {
    _socket?.emit('call.cancel', {'conversationId': conversationId});
    state = const CallUiState();
  }

  void endCall({String? conversationId, String? roomName}) {
    final cid = conversationId ?? _activeConversationId;
    final rname = roomName ?? _activeRoomName;
    if (cid != null) {
      final payload = <String, dynamic>{'conversationId': cid};
      if (rname != null) payload['roomName'] = rname;
      _socket?.emit('call.end', payload);
    }
    _activeConversationId = null;
    _activeRoomName = null;
    state = const CallUiState();
  }

  Future<void> joinRoom(
    String roomName, {
    String? conversationId,
    String? displayName,
  }) async {
    _activeRoomName = roomName;
    _activeConversationId = conversationId;
    final options = JitsiMeetConferenceOptions(
      serverURL: 'https://${AppConfig.jitsiServer}',
      room: roomName,
      configOverrides: {
        'startWithAudioMuted': false,
        'startWithVideoMuted': false,
      },
      userInfo: JitsiMeetUserInfo(displayName: displayName ?? 'User'),
    );
    final listener = JitsiMeetEventListener(
      conferenceTerminated: (url, error) {
        endCall();
      },
    );
    await _jitsi.join(options, listener);
  }
}

final callControllerProvider = NotifierProvider<CallController, CallUiState>(CallController.new);
