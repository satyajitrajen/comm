import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/config.dart';
import 'package:app/core/permissions.dart';
import 'package:app/core/push_routes.dart';
import 'package:app/features/splash/splash_screen.dart';

void main() {
  test('call room names match web', () {
    expect(callRoomName('abc'), 'veloce-call-abc');
  });

  test('settings and calls always allowed', () {
    expect(navKeyAllowed('settings', {'allowedNavKeys': ['home']}), isTrue);
    expect(navKeyAllowed('calls', {'allowedNavKeys': ['home']}), isTrue);
    expect(navKeyAllowed('teams', {'allowedNavKeys': ['home']}), isFalse);
    expect(navKeyAllowed('home', {'allowedNavKeys': ['home']}), isTrue);
  });

  test('API default is production server', () {
    expect(AppConfig.debugDefault, 'https://communication.impmeet.com');
    expect(AppConfig.apiBaseUrl(isRelease: false), 'https://communication.impmeet.com');
    expect(AppConfig.apiBaseUrl(isRelease: true), 'https://communication.impmeet.com');
  });

  test('push urls map onto Flutter routes', () {
    expect(
      routeFromPushUrl('/teams?conversation=abc&message=1'),
      '/chat/abc?type=GROUP',
    );
    expect(routeFromPushUrl('/dms?conversation=dm1'), '/chat/dm1?type=DIRECT');
    expect(routeFromPushUrl('/calls?conversation=c1'), '/calls');
    expect(routeFromPushUrl('/activity'), '/activity');
    expect(routeFromPushUrl(null), '/home');
  });

  testWidgets('SplashScreen displays brand title and tagline', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: SplashScreen(),
      ),
    );
    expect(find.text('TeamTime'), findsOneWidget);
    expect(find.text('Connect. Collaborate. Communicate.'), findsOneWidget);
  });
}
