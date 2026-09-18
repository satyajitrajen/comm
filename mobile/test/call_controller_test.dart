import 'package:app/core/auth_notifier.dart';
import 'package:app/core/socket_client.dart';
import 'package:app/features/calls/call_controller.dart';
import 'package:app/features/calls/incoming_call_overlay.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jitsi_meet_flutter_sdk/jitsi_meet_flutter_sdk.dart';
import 'package:jitsi_meet_flutter_sdk/src/method_response.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

class FakeSocket implements io.Socket {
  final Map<String, dynamic Function(dynamic)> handlers = {};
  final Map<String, dynamic> emissions = {};

  void dispatch(String event, Map<String, dynamic> data) {
    final handler = handlers[event];
    if (handler == null) {
      throw StateError('FakeSocket: no handler registered for $event');
    }
    handler(data);
  }

  @override
  Function() on(String event, dynamic Function(dynamic) handler) {
    handlers[event] = handler;
    return () {};
  }

  @override
  void off(String event, [dynamic Function(dynamic)? handler]) {
    handlers.remove(event);
  }

  @override
  void emit(String event, [dynamic data]) {
    emissions[event] = data;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class FakeTeamTimeSocket extends TeamTimeSocket {
  FakeTeamTimeSocket(this.socket)
      : super(baseUrl: 'http://localhost:1', tokenProvider: () async => null);

  @override
  final io.Socket socket;

  @override
  void Function() onSocket(void Function(io.Socket socket) binder) {
    binder(socket);
    return () {};
  }
}

class FakeAuthNotifier extends AuthNotifier {
  @override
  AuthState build() => const AuthState(
        user: {'id': 'user-1', 'displayName': 'Tester'},
        booting: false,
      );
}

class FakeJitsi implements JitsiMeet {
  FakeJitsi({this.failJoin = false});

  bool failJoin;
  bool joined = false;
  bool hungUp = false;

  @override
  Future<MethodResponse> join(JitsiMeetConferenceOptions options,
      [JitsiMeetEventListener? listener]) async {
    if (failJoin) {
      throw Exception('join failed');
    }
    joined = true;
    return MethodResponse(isSuccess: true);
  }

  @override
  Future<MethodResponse> hangUp() async {
    hungUp = true;
    return MethodResponse(isSuccess: true);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeSocket socket;
  late FakeJitsi jitsi;
  late ProviderContainer container;

  setUp(() {
    socket = FakeSocket();
    jitsi = FakeJitsi();
    container = ProviderContainer(overrides: [
      socketClientProvider.overrideWithValue(FakeTeamTimeSocket(socket)),
      authProvider.overrideWith(FakeAuthNotifier.new),
      jitsiProvider.overrideWithValue(jitsi),
    ]);
    addTearDown(container.dispose);
  });

  Future<void> flush() => pumpEventQueue();

  group('call.ended / call.cancelled guard', () {
    test('ignores ends from other conversations while ringing', () {
      container.read(callControllerProvider.notifier);
      socket.dispatch('call.incoming', {
        'conversationId': 'conv-a',
        'roomName': 'veloce-call-conv-a',
        'callerId': 'caller-9',
        'callerName': 'Caller',
        'conversationName': 'Direct A',
      });
      expect(
        container.read(callControllerProvider).incoming?.conversationId,
        'conv-a',
      );

      socket.dispatch('call.ended', {
        'conversationId': 'conv-other',
        'endedBy': 'user-2',
      });

      expect(
        container.read(callControllerProvider).incoming?.conversationId,
        'conv-a',
        reason: 'an unrelated call.ended must not dismiss a ringing call',
      );
    });

    test('still dismisses ringing when the ringing conversation ends', () {
      container.read(callControllerProvider.notifier);
      socket.dispatch('call.incoming', {
        'conversationId': 'conv-a',
        'roomName': 'veloce-call-conv-a',
        'callerId': 'caller-9',
        'callerName': 'Caller',
        'conversationName': 'Direct A',
      });

      socket.dispatch('call.ended', {'conversationId': 'conv-a'});

      expect(container.read(callControllerProvider).incoming, isNull);
    });
  });

  group('call.escalated', () {
    test('renames the outgoing call and sets a notice while ringing', () async {
      final notifier = container.read(callControllerProvider.notifier);
      await notifier.invite(
        conversationId: 'conv-a',
        conversationName: 'Alice',
        conversationType: 'DIRECT',
      );

      socket.dispatch('call.escalated', {
        'roomName': 'veloce-call-conv-a',
        'conversationId': 'conv-group',
        'conversationName': 'Group Call',
      });

      final state = container.read(callControllerProvider);
      expect(state.outgoing?.conversationId, 'conv-group');
      expect(state.outgoing?.conversationName, 'Group Call');
      expect(state.callNotice, isNotNull);
    });

    test('during an active call retargets tracking so call.ended hangs up',
        () async {
      final notifier = container.read(callControllerProvider.notifier);
      await notifier.invite(
        conversationId: 'conv-a',
        conversationName: 'Alice',
        conversationType: 'DIRECT',
      );
      socket.dispatch('call.accepted', {'conversationId': 'conv-a'});
      await flush();
      expect(container.read(callControllerProvider).inCall, isTrue);
      expect(jitsi.joined, isTrue);

      socket.dispatch('call.escalated', {
        'roomName': 'veloce-call-conv-a',
        'conversationId': 'conv-group',
        'conversationName': 'Group Call',
      });
      socket.dispatch('call.ended', {
        'conversationId': 'conv-group',
        'endedBy': 'user-2',
      });
      await flush();

      final state = container.read(callControllerProvider);
      expect(state.inCall, isFalse,
          reason: 'remote end of the escalated call must not be ignored');
      expect(jitsi.hungUp, isTrue,
          reason: 'the local Jitsi conference must be hung up');
    });
  });

  test('failed join after accept leaves the app out of the call', () async {
    jitsi.failJoin = true;
    final notifier = container.read(callControllerProvider.notifier);
    await notifier.invite(
      conversationId: 'conv-a',
      conversationName: 'Alice',
      conversationType: 'DIRECT',
    );

    socket.dispatch('call.accepted', {'conversationId': 'conv-a'});
    await flush();

    final state = container.read(callControllerProvider);
    expect(state.inCall, isFalse,
        reason: 'a failed Jitsi join must not strand a phantom in-call state');
    expect(state.outgoing, isNull);
  });

  testWidgets('outgoing call overlay surfaces the declined-by notice',
      (tester) async {
    final notifier = container.read(callControllerProvider.notifier);
    await notifier.invite(
      conversationId: 'conv-a',
      conversationName: 'Alice',
      conversationType: 'DIRECT',
    );
    socket.dispatch('call.declined', {
      'conversationId': 'conv-a',
      'declinedByName': 'Rahul',
    });

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(
          home: Scaffold(body: CallNoticeBanner()),
        ),
      ),
    );
    await tester.pump();

    expect(find.textContaining('Rahul'), findsOneWidget);

    // Flush the 1.6s declined reset and 4s notice-clear timers so the
    // fake-async zone ends with no pending timers.
    await tester.pump(const Duration(seconds: 6));
  });
}
