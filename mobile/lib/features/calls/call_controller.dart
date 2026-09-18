import 'dart:async';
import 'package:flutter/widgets.dart';
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
    this.callNotice,
  });

  final IncomingCall? incoming;
  final OutgoingCall? outgoing;
  final bool inCall;
  final String? callNotice;

  String? get outgoingName => outgoing?.contactName;

  CallUiState copyWith({
    IncomingCall? incoming,
    OutgoingCall? outgoing,
    bool? inCall,
    String? callNotice,
    bool clearNotice = false,
  }) {
    return CallUiState(
      incoming: incoming ?? this.incoming,
      outgoing: outgoing ?? this.outgoing,
      inCall: inCall ?? this.inCall,
      callNotice: clearNotice ? null : (callNotice ?? this.callNotice),
    );
  }
}

class CallController extends Notifier<CallUiState> with WidgetsBindingObserver {
  JitsiMeet _jitsi = JitsiMeet();
  io.Socket? _socket;
  void Function()? _unbind;
  Timer? _outgoingTimeoutTimer;
  Timer? _noticeTimer;

  @override
  CallUiState build() {
    _jitsi = ref.read(jitsiProvider);
    final client = ref.watch(socketClientProvider);
    _unbind?.call();
    _detach(_socket);
    _socket = null;
    _unbind = client.onSocket(_attach);
    WidgetsBinding.instance.addObserver(this);
    ref.onDispose(() {
      _outgoingTimeoutTimer?.cancel();
      _noticeTimer?.cancel();
      _unbind?.call();
      _detach(_socket);
      _socket = null;
      WidgetsBinding.instance.removeObserver(this);
    });
    return const CallUiState();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.detached) {
      final cid = _activeConversationId;
      final rname = _activeRoomName;
      if (cid != null) {
        final payload = <String, dynamic>{'conversationId': cid};
        if (rname != null) payload['roomName'] = rname;
        _socket?.emit('call.end', payload);
      }
    }
  }

  void _detach(io.Socket? socket) {
    if (socket == null) return;
    socket
      ..off('call.incoming', _onIncoming)
      ..off('call.accepted', _onAccepted)
      ..off('call.declined', _onDeclined)
      ..off('call.ended', _onEnded)
      ..off('call.cancelled', _onCancelled)
      ..off('call.escalated', _onEscalated)
      ..off('call.left', _onLeft);
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
      ..on('call.cancelled', _onCancelled)
      ..on('call.escalated', _onEscalated)
      ..on('call.left', _onLeft);
  }

  void _onIncoming(dynamic data) {
    if (data is! Map) return;
    final me = ref.read(authProvider).user;
    final myId = me?['id']?.toString();
    final callerId = '${data['callerId']}';
    if (myId != null && callerId == myId) return;
    final convId = '${data['conversationId']}';

    if (state.inCall || state.incoming != null) {
      final sameCall = state.incoming?.conversationId == convId ||
          state.outgoing?.conversationId == convId;
      if (!sameCall) {
        _socket?.emit('call.decline', {
          'conversationId': convId,
          'callerId': callerId,
        });
      }
      return;
    }

    final incoming = IncomingCall(
      conversationId: convId,
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
      conversationType: incoming.conversationType,
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
      conversationType: incoming.conversationType,
    );
  }

  void dismissIncoming() {
    cancelIncomingCallNotification();
    if (state.incoming != null) {
      state = const CallUiState();
    }
  }

  void _onAccepted(dynamic data) async {
    if (data is! Map) return;
    final convId = data['conversationId']?.toString();
    final outgoing = state.outgoing;
    if (outgoing != null && convId != null && convId != outgoing.conversationId) return;

    cancelIncomingCallNotification();
    if (outgoing != null) {
      _outgoingTimeoutTimer?.cancel();
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
      if (_jitsiActive) state = const CallUiState(inCall: true);
    } else {
      state = const CallUiState();
    }
  }

  void _onDeclined(dynamic data) {
    if (data is! Map) return;
    final convId = data['conversationId']?.toString();
    final declinedByName = data['declinedByName']?.toString();
    final outgoing = state.outgoing;
    if (outgoing != null && convId != null && convId != outgoing.conversationId) return;

    cancelIncomingCallNotification();
    if (outgoing != null) {
      _outgoingTimeoutTimer?.cancel();
      state = CallUiState(
        outgoing: outgoing.copyWith(status: OutgoingCallStatus.declined),
      );
      if (declinedByName != null) {
        _noticeTimer?.cancel();
        state = state.copyWith(callNotice: 'Call declined by $declinedByName');
        _noticeTimer = Timer(const Duration(seconds: 4), () {
          state = state.copyWith(clearNotice: true);
        });
      }
      Future.delayed(const Duration(milliseconds: 1600), () {
        if (state.outgoing?.status == OutgoingCallStatus.declined) {
          state = const CallUiState();
        }
      });
    } else {
      state = const CallUiState();
    }
  }

  void _onEnded(dynamic data) {
    if (data is! Map) return;
    final convId = data['conversationId']?.toString();
    if (convId != null &&
        convId != _activeConversationId &&
        state.outgoing?.conversationId != convId &&
        state.incoming?.conversationId != convId) {
      return;
    }

    _outgoingTimeoutTimer?.cancel();
    cancelIncomingCallNotification();
    state = const CallUiState();
    _activeConversationId = null;
    _activeRoomName = null;
    unawaited(_hangUpIfActive());
  }

  void _onCancelled(dynamic data) {
    if (data is! Map) return;
    final convId = data['conversationId']?.toString();
    if (convId != null &&
        convId != _activeConversationId &&
        state.outgoing?.conversationId != convId &&
        state.incoming?.conversationId != convId) {
      return;
    }

    _outgoingTimeoutTimer?.cancel();
    cancelIncomingCallNotification();
    state = const CallUiState();
    _activeConversationId = null;
    _activeRoomName = null;
    unawaited(_hangUpIfActive());
  }

  void _onEscalated(dynamic data) {
    if (data is! Map) return;
    final newConvId = data['conversationId']?.toString();
    final newConvName = data['conversationName']?.toString();
    final roomName = data['roomName']?.toString();
    if (newConvId == null) return;

    final outgoing = state.outgoing;
    if (outgoing != null && (roomName == null || outgoing.roomName == roomName)) {
      state = state.copyWith(
        outgoing: outgoing.copyWith(
          conversationId: newConvId,
          conversationName: newConvName ?? 'Group Call',
          contactName: newConvName ?? 'Group Call',
        ),
      );
      _activeConversationId = newConvId;
      _noticeTimer?.cancel();
      state = state.copyWith(
        callNotice: 'Call upgraded to group: ${newConvName ?? 'Group Call'}',
      );
      _noticeTimer = Timer(const Duration(seconds: 4), () {
        state = state.copyWith(clearNotice: true);
      });
    }

    // The call is live: the backend reassigned the conversation to a new
    // GROUP id, so later call.ended/call.cancelled events carry that id.
    // Track it, otherwise the remote end is ignored and the local Jitsi
    // conference is stranded. roomName itself is unchanged.
    if (_jitsiActive || state.inCall) {
      _activeConversationId = newConvId;
      if (roomName != null) _activeRoomName = roomName;
    }
  }

  void _onLeft(dynamic data) {
    if (data is! Map) return;
    final convId = data['conversationId']?.toString();
    if (convId != null &&
        convId != _activeConversationId &&
        state.outgoing?.conversationId != convId &&
        state.incoming?.conversationId != convId) {
      return;
    }

    cancelIncomingCallNotification();
    state = const CallUiState();
    _activeConversationId = null;
    _activeRoomName = null;
    unawaited(_hangUpIfActive());
  }

  String? _activeConversationId;
  String? _activeRoomName;
  bool _jitsiActive = false;

  Future<void> _hangUpQuietly() async {
    try {
      await _jitsi.hangUp();
    } catch (_) {
      // Conference already gone or SDK not initialized.
    }
  }

  Future<void> _hangUpIfActive() async {
    if (!_jitsiActive) return;
    _jitsiActive = false;
    await _hangUpQuietly();
  }

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
    final wasActive = _jitsiActive;
    _jitsiActive = false;
    final cid = conversationId ?? _activeConversationId;
    final rname = roomName ?? _activeRoomName;
    // Only announce the end if a call was actually running; readyToClose and
    // conferenceTerminated both funnel here, so guard against duplicate emits.
    final hadCall = wasActive || state.outgoing != null || state.incoming != null;
    if (cid != null && hadCall) {
      final payload = <String, dynamic>{'conversationId': cid};
      if (rname != null) payload['roomName'] = rname;
      _socket?.emit('call.end', payload);
    }
    _activeConversationId = null;
    _activeRoomName = null;
    if (wasActive) {
      unawaited(_hangUpQuietly());
    }
    state = const CallUiState();
  }

  Future<void> joinRoom(
    String roomName, {
    String? conversationId,
    String? displayName,
  }) async {
    _activeRoomName = roomName;
    _activeConversationId = conversationId;
    // Mirrors the web client's Jitsi options (frontend VideoCallModal): no
    // pre-join page, leaving never ends the conference for others, no
    // invite/calendar/recording UI, minimal chrome.
    final options = JitsiMeetConferenceOptions(
      serverURL: 'https://${AppConfig.jitsiServer}',
      room: roomName,
      configOverrides: {
        'startWithAudioMuted': false,
        'startWithVideoMuted': false,
        'prejoinPageEnabled': false,
        'prejoinConfig': {'enabled': false},
        'hideConferenceSubject': true,
        'hideConferenceTimer': true,
        'hideRecordingLabel': true,
        'disableDeepLinking': true,
        'enableEndConference': false,
        'enableLeaveUserReason': false,
      },
      featureFlags: {
        FeatureFlags.welcomePageEnabled: false,
        FeatureFlags.preJoinPageEnabled: false,
        FeatureFlags.calenderEnabled: false,
        FeatureFlags.inviteEnabled: false,
        FeatureFlags.addPeopleEnabled: false,
        FeatureFlags.recordingEnabled: false,
        FeatureFlags.liveStreamingEnabled: false,
        FeatureFlags.serverUrlChangeEnabled: false,
        FeatureFlags.unsafeRoomWarningEnabled: false,
        FeatureFlags.toolboxAlwaysVisible: true,
      },
      userInfo: JitsiMeetUserInfo(displayName: displayName ?? 'User'),
    );
    final listener = JitsiMeetEventListener(
      conferenceTerminated: (url, error) {
        endCall();
      },
      readyToClose: () {
        endCall();
      },
    );
    _jitsiActive = true;
    try {
      await _jitsi.join(options, listener);
    } catch (_) {
      // Join failed (init error, permissions, server unreachable): don't leave
      // the app stuck in the inCall state with no Jitsi UI.
      _jitsiActive = false;
      _activeRoomName = null;
      _activeConversationId = null;
      state = const CallUiState();
    }
  }
}

final jitsiProvider = Provider<JitsiMeet>((ref) => JitsiMeet());

final callControllerProvider = NotifierProvider<CallController, CallUiState>(CallController.new);
