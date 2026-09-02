import 'package:app/core/session.dart';
import 'package:flutter_secure_storage/test/test_flutter_secure_storage_platform.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final storage = <String, String>{};

  setUpAll(() {
    FlutterSecureStoragePlatform.instance = TestFlutterSecureStoragePlatform(storage);
  });

  setUp(storage.clear);

  test('clear() wipes tokens and user', () async {
    final session = SecureSession();
    await session.saveTokens(accessToken: 'a', refreshToken: 'r', sessionId: 's');
    await session.saveUserJson('{"id":"u1"}');
    expect(await session.accessToken, 'a');
    expect(await session.refreshToken, 'r');
    expect(await session.sessionId, 's');
    expect(await session.userJson, '{"id":"u1"}');

    await session.clear();

    expect(await session.accessToken, isNull);
    expect(await session.refreshToken, isNull);
    expect(await session.sessionId, isNull);
    expect(await session.userJson, isNull);
  });
}
