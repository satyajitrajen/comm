import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jitsi_meet_flutter_sdk/jitsi_meet_flutter_sdk.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../core/auth_notifier.dart';
import '../../core/config.dart';

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
  io.Socket? _socket;
  final _jitsi = JitsiMeet();

  @override
  CallUiState build() => const CallUiState();

  void attachSocket(io.Socket socket) {
    _socket = socket;
    socket.on('call.incoming', (data) {
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
    });
    socket.on('call.accept', (_) {
      state = const CallUiState(inCall: true);
    });
    socket.on('call.decline', (_) {
      state = const CallUiState();
    });
    socket.on('call.end', (_) {
      state = const CallUiState();
    });
    socket.on('call.cancel', (_) {
      state = const CallUiState();
    });
  }

  Future<void> invite({
    required String conversationId,
    required String conversationName,
    required String conversationType,
    io.Socket? socket,
  }) async {
    final s = socket ?? _socket;
    final me = ref.read(authProvider).user;
    s?.emit('call.invite', {
      'conversationId': conversationId,
      'roomName': callRoomName(conversationId),
      'conversationName': conversationName,
      'conversationType': conversationType,
    });
    state = CallUiState(outgoingName: conversationName, inCall: false);
    await joinRoom(callRoomName(conversationId), displayName: me?['displayName'] as String?);
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
    await joinRoom(incoming.roomName, displayName: me?['displayName'] as String?);
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

  Future<void> joinRoom(String roomName, {String? displayName}) async {
    final options = JitsiMeetConferenceOptions(
      serverURL: 'https://${AppConfig.jitsiServer}',
      room: roomName,
      configOverrides: {
        'startWithAudioMuted': false,
        'startWithVideoMuted': false,
      },
      userInfo: JitsiMeetUserInfo(displayName: displayName ?? 'User'),
    );
    await _jitsi.join(options);
  }
}

final callControllerProvider = NotifierProvider<CallController, CallUiState>(CallController.new);
