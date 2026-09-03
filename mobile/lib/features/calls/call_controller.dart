import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:jitsi_meet_flutter_sdk/jitsi_meet_flutter_sdk.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../core/auth_notifier.dart';
import '../../core/config.dart';
import '../../core/fcm.dart';
import '../../core/socket_client.dart';

enum OutgoingCallStatus { calling, ringing, accepted, declined, timeout }

class OutgoingCall {
  const OutgoingCall({
    required this.conversationId,
    required this.roomName,
    required this.contactName,
    required this.conversationName,
    this.status = OutgoingCallStatus.calling,
  });

  final String conversationId;
  final String roomName;
  final String contactName;
  final String conversationName;
  final OutgoingCallStatus status;

  OutgoingCall copyWith({
    String? conversationId,
    String? roomName,
    String? contactName,
    String? conversationName,
    OutgoingCallStatus? status,
  }) {
    return OutgoingCall(
      conversationId: conversationId ?? this.conversationId,
      roomName: roomName ?? this.roomName,
      contactName: contactName ?? this.contactName,
      conversationName: conversationName ?? this.conversationName,
      status: status ?? this.status,
    );
  }
}

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
  const CallUiState({
    this.incoming,
    this.outgoing,
    this.inCall = false,
  });

  final IncomingCall? incoming;
  final OutgoingCall? outgoing;
  final bool inCall;

  String? get outgoingName => outgoing?.contactName;

  CallUiState copyWith({
    IncomingCall? incoming,
    OutgoingCall? outgoing,
    bool? inCall,
  }) {
    return CallUiState(
      incoming: incoming ?? this.incoming,
      outgoing: outgoing ?? this.outgoing,
      inCall: inCall ?? this.inCall,
    );
  }
}

class CallController extends Notifier<CallUiState> {
  final _jitsi = JitsiMeet();
  io.Socket? _socket;
  void Function()? _unbind;
  Timer? _outgoingTimeoutTimer;

  @override
  CallUiState build() {
    final client = ref.watch(socketClientProvider);
    _unbind?.call();
    _detach(_socket);
    _socket = null;
    _unbind = client.onSocket(_attach);
    ref.onDispose(() {
      _outgoingTimeoutTimer?.cancel();
      _unbind?.call();
      _detach(_socket);
      _socket = null;
    });
    return const CallUiState();
  }

  void _detach(io.Socket? socket) {
    if (socket == null) return;
    socket
      ..off('call.incoming', _onIncoming)
      ..off('call.accepted', _onAccepted)
      ..off('call.declined', _onDeclined)
      ..off('call.ended', _onEnded)
      ..off('call.cancelled', _onCancelled);
  }

  void _attach(io.Socket socket) {
    if (identical(_socket, socket)) return;
    _detach(_socket);
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
    final me = ref.read(authProvider).user;
    final myId = me?['id']?.toString();
    final callerId = '${data['callerId']}';
    if (myId != null && callerId == myId) return;
    if (state.inCall || state.incoming != null) return;
    final incoming = IncomingCall(
      conversationId: '${data['conversationId']}',
      roomName: '${data['roomName']}',
      callerId: callerId,
      callerName: '${data['callerName']}',
      conversationName: '${data['conversationName']}',
      conversationType: data['conversationType']?.toString(),
    );
    state = CallUiState(incoming: incoming);
    showIncomingCallNotification(
      callerName: incoming.callerName,
      conversationName: incoming.conversationName,
      conversationId: incoming.conversationId,
    );
  }

  void handleIncomingCallStart({
    required String conversationId,
    required String conversationName,
    required String callerName,
    required String callerId,
    String? roomName,
    String? conversationType,
  }) {
    final me = ref.read(authProvider).user;
    final myId = me?['id']?.toString();
    if (myId != null && callerId == myId) return;
    if (state.inCall || state.incoming != null) return;

    final resolvedRoom = roomName ?? callRoomName(conversationId);
    final incoming = IncomingCall(
      conversationId: conversationId,
      roomName: resolvedRoom,
      callerId: callerId,
      callerName: callerName,
      conversationName: conversationName,
      conversationType: conversationType,
    );
    state = CallUiState(incoming: incoming);
    showIncomingCallNotification(
      callerName: incoming.callerName,
      conversationName: incoming.conversationName,
      conversationId: incoming.conversationId,
    );
  }

  void dismissIncoming() {
    cancelIncomingCallNotification();
    if (state.incoming != null) {
      state = const CallUiState();
    }
  }

  void _onAccepted(dynamic data) async {
    cancelIncomingCallNotification();
    final outgoing = state.outgoing;
    if (outgoing != null) {
      _outgoingTimeoutTimer?.cancel();
      // Other person accepted! Now enter Jitsi Meet.
      state = CallUiState(
        outgoing: outgoing.copyWith(status: OutgoingCallStatus.accepted),
        inCall: true,
      );
      final me = ref.read(authProvider).user;
      await joinRoom(
        outgoing.roomName,
        conversationId: outgoing.conversationId,
        displayName: me?['displayName'] as String?,
      );
      state = const CallUiState(inCall: true);
    } else {
      state = const CallUiState();
    }
  }

  void _onDeclined(dynamic data) {
    cancelIncomingCallNotification();
    final outgoing = state.outgoing;
    if (outgoing != null) {
      _outgoingTimeoutTimer?.cancel();
      state = CallUiState(
        outgoing: outgoing.copyWith(status: OutgoingCallStatus.declined),
      );
      Future.delayed(const Duration(milliseconds: 1600), () {
        if (state.outgoing?.status == OutgoingCallStatus.declined) {
          state = const CallUiState();
        }
      });
    } else {
      state = const CallUiState();
    }
  }

  void _onEnded(dynamic _) {
    _outgoingTimeoutTimer?.cancel();
    cancelIncomingCallNotification();
    state = const CallUiState();
  }

  void _onCancelled(dynamic _) {
    _outgoingTimeoutTimer?.cancel();
    cancelIncomingCallNotification();
    state = const CallUiState();
  }

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

    _outgoingTimeoutTimer?.cancel();
    // Do NOT join room yet! Set state to outgoing call screen and wait for other party to accept.
    state = CallUiState(
      outgoing: OutgoingCall(
        conversationId: conversationId,
        roomName: room,
        contactName: conversationName,
        conversationName: conversationName,
        status: OutgoingCallStatus.calling,
      ),
      inCall: false,
    );

    // 35s auto-timeout if no answer
    _outgoingTimeoutTimer = Timer(const Duration(seconds: 35), () {
      if (state.outgoing != null && !state.inCall) {
        cancelOutgoing();
      }
    });
  }

  Future<void> accept() async {
    final incoming = state.incoming;
    if (incoming == null) return;
    cancelIncomingCallNotification();
    _socket?.emit('call.accept', {
      'conversationId': incoming.conversationId,
      'callerId': incoming.callerId,
      'roomName': incoming.roomName,
      'conversationName': incoming.conversationName,
    });
    final me = ref.read(authProvider).user;
    state = const CallUiState(inCall: true);
    await joinRoom(
      incoming.roomName,
      conversationId: incoming.conversationId,
      displayName: me?['displayName'] as String?,
    );
  }

  Future<void> joinCall({
    required String conversationId,
    required String conversationName,
    String? roomName,
    String? displayName,
  }) async {
    cancelIncomingCallNotification();
    final room = roomName ?? callRoomName(conversationId);
    _socket?.emit('call.join', {
      'conversationId': conversationId,
      'roomName': room,
      'conversationName': conversationName,
    });
    final me = ref.read(authProvider).user;
    state = const CallUiState(inCall: true);
    await joinRoom(
      room,
      conversationId: conversationId,
      displayName: displayName ?? (me?['displayName'] as String?),
    );
  }

  void decline() {
    final incoming = state.incoming;
    cancelIncomingCallNotification();
    if (incoming != null) {
      _socket?.emit('call.decline', {
        'conversationId': incoming.conversationId,
        'callerId': incoming.callerId,
      });
    }
    state = const CallUiState();
  }

  void cancelOutgoing([String? conversationId]) {
    _outgoingTimeoutTimer?.cancel();
    cancelIncomingCallNotification();
    final cid = conversationId ?? state.outgoing?.conversationId;
    if (cid != null) {
      final me = ref.read(authProvider).user;
      _socket?.emit('call.cancel', {
        'conversationId': cid,
        'roomName': state.outgoing?.roomName ?? callRoomName(cid),
        'callerName': (me?['displayName'] as String?) ?? 'User',
      });
    }
    state = const CallUiState();
  }

  void endCall({String? conversationId, String? roomName}) {
    _outgoingTimeoutTimer?.cancel();
    cancelIncomingCallNotification();
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
