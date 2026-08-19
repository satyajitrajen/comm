import 'package:flutter_test/flutter_test.dart';
import 'package:app/core/config.dart';
import 'package:app/core/permissions.dart';
import 'package:app/core/push_routes.dart';

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

  test('debug API default is emulator loopback', () {
    expect(AppConfig.debugDefault, 'http://10.0.2.2:5000');
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
}
