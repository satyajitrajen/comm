import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/features/calls/call_controller.dart';
import 'package:app/features/calls/incoming_call_overlay.dart';
import 'package:app/widgets/design_system.dart';

void main() {
  testWidgets('TtButton.primary renders as white pill button with dark text', (tester) async {
    var pressed = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TtButton.primary(
            text: 'Continue with Apple',
            icon: Icons.apple,
            onPressed: () => pressed = true,
          ),
        ),
      ),
    );

    expect(find.text('Continue with Apple'), findsOneWidget);
    expect(find.byIcon(Icons.apple), findsOneWidget);

    await tester.tap(find.text('Continue with Apple'));
    expect(pressed, isTrue);
  });

  testWidgets('TtButton.secondary renders as glass pill button with white text', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: TtButton.secondary(
            text: 'Recover existing wallet',
            onPressed: () {},
          ),
        ),
      ),
    );

    expect(find.text('Recover existing wallet'), findsOneWidget);
  });

  testWidgets('TtSquircleBadge renders container with child', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: TtSquircleBadge(
            child: Icon(Icons.hub_rounded),
          ),
        ),
      ),
    );

    expect(find.byIcon(Icons.hub_rounded), findsOneWidget);
  });

  testWidgets('Chats layout unread badge renders with golden yellow circle', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Container(
            width: 20,
            height: 20,
            decoration: const BoxDecoration(
              color: Color(0xFFF59E0B),
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Text(
                '2',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.text('2'), findsOneWidget);
    final container = tester.widget<Container>(find.byType(Container));
    final decoration = container.decoration as BoxDecoration;
    expect(decoration.color, const Color(0xFFF59E0B));
    expect(decoration.shape, BoxShape.circle);
  });

  testWidgets('Chat file attachment renders file icon, name, and size', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.picture_as_pdf_rounded),
                SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('report.pdf'),
                    Text('1.5 MB'),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );

    expect(find.text('report.pdf'), findsOneWidget);
    expect(find.text('1.5 MB'), findsOneWidget);
    expect(find.byIcon(Icons.picture_as_pdf_rounded), findsOneWidget);
  });

  testWidgets('IncomingCallOverlay renders caller name, Accept and Decline buttons', (tester) async {
    final call = IncomingCall(
      conversationId: 'conv-123',
      roomName: 'veloce-call-conv-123',
      callerId: 'user-456',
      callerName: 'Satya',
      conversationName: 'General Team',
      conversationType: 'DIRECT',
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: IncomingCallOverlay(call: call),
          ),
        ),
      ),
    );

    expect(find.text('Satya'), findsOneWidget);
    expect(find.text('General Team'), findsOneWidget);
    expect(find.text('Accept'), findsOneWidget);
    expect(find.text('Decline'), findsOneWidget);
    expect(find.byIcon(Icons.call_rounded), findsOneWidget);
    expect(find.byIcon(Icons.call_end_rounded), findsOneWidget);
  });

  testWidgets('OutgoingCallOverlay renders contact name, timer, End, Speaker, and Mute buttons', (tester) async {
    const outgoing = OutgoingCall(
      conversationId: 'conv-123',
      roomName: 'veloce-call-conv-123',
      contactName: 'Sanket Ankush',
      conversationName: 'Sanket Ankush',
      status: OutgoingCallStatus.calling,
    );

    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(
            body: OutgoingCallOverlay(outgoing: outgoing),
          ),
        ),
      ),
    );

    expect(find.text('Sanket Ankush'), findsOneWidget);
    expect(find.text('Calling…'), findsOneWidget);
    expect(find.text('End'), findsOneWidget);
    expect(find.text('Speaker'), findsOneWidget);
    expect(find.text('Mute'), findsOneWidget);
    expect(find.byIcon(Icons.call_end_rounded), findsOneWidget);
  });
}

