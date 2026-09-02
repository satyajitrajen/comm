import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:app/core/api_client.dart';
import 'package:app/core/session.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/test/test_flutter_secure_storage_platform.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';

class _RequestLog {
  _RequestLog(RequestOptions options)
      : path = options.path,
        headers = Map<String, dynamic>.from(options.headers),
        extra = Map<String, dynamic>.from(options.extra);

  final String path;
  final Map<String, dynamic> headers;
  final Map<String, dynamic> extra;
}

class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this._handler);

  final Future<ResponseBody> Function(RequestOptions options) _handler;
  final List<_RequestLog> logs = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    logs.add(_RequestLog(options));
    return _handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object body, int status) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

Future<SecureSession> sessionWithTokens() async {
  final session = SecureSession();
  await session.saveTokens(
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    sessionId: 'sess-1',
  );
  return session;
}

void main() {
  final storage = <String, String>{};

  setUpAll(() {
    FlutterSecureStoragePlatform.instance = TestFlutterSecureStoragePlatform(storage);
  });

  setUp(storage.clear);

  test('refresh-on-401 retries the request with the new access token', () async {
    final session = await sessionWithTokens();
    final api = ApiClient(session);
    final adapter = _StubAdapter((options) async {
      if (options.path == '/api/v1/auth/refresh') {
        return _json(
          {'accessToken': 'new-access', 'refreshToken': 'new-refresh', 'sessionId': 'sess-2'},
          200,
        );
      }
      if (options.extra['_retry'] == true) return _json({'ok': true}, 200);
      return _json({'error': 'expired'}, 401);
    });
    api.dio.httpClientAdapter = adapter;

    final res = await api.dio.get<Map<String, dynamic>>('/api/v1/secure');

    expect(res.data, {'ok': true});
    expect(adapter.logs, hasLength(3));
    expect(adapter.logs[0].headers['Authorization'], 'Bearer old-access');
    expect(adapter.logs[1].path, '/api/v1/auth/refresh');
    expect(adapter.logs[2].headers['Authorization'], 'Bearer new-access');
    expect(await session.accessToken, 'new-access');
    expect(await session.refreshToken, 'new-refresh');
    expect(await session.sessionId, 'sess-2');
  });

  test('concurrent 401s share a single refresh call', () async {
    final session = await sessionWithTokens();
    final api = ApiClient(session);
    var refreshCalls = 0;
    final refreshGate = Completer<void>();
    final adapter = _StubAdapter((options) async {
      if (options.path == '/api/v1/auth/refresh') {
        refreshCalls++;
        return refreshGate.future.then(
          (_) => _json(
            {'accessToken': 'new-access', 'refreshToken': 'new-refresh', 'sessionId': 'sess-2'},
            200,
          ),
        );
      }
      if (options.extra['_retry'] == true) return _json({'ok': true}, 200);
      return _json({'error': 'expired'}, 401);
    });
    api.dio.httpClientAdapter = adapter;

    final first = api.dio.get('/api/v1/secure');
    final second = api.dio.get('/api/v1/secure');
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(refreshCalls, 1);
    refreshGate.complete();
    await Future.wait([first, second]);
    expect(refreshCalls, 1);
    expect(await session.accessToken, 'new-access');
    expect(await session.refreshToken, 'new-refresh');
  });

  test('failing refresh clears the session and fires onSessionExpired', () async {
    final session = await sessionWithTokens();
    var expiredCalls = 0;
    final api = ApiClient(session, onSessionExpired: () async => expiredCalls++);
    final adapter = _StubAdapter((options) async => _json({'error': 'unauthorized'}, 401));
    api.dio.httpClientAdapter = adapter;

    await expectLater(api.dio.get('/api/v1/secure'), throwsA(isA<DioException>()));

    expect(expiredCalls, 1);
    expect(await session.accessToken, isNull);
    expect(await session.refreshToken, isNull);
    expect(await session.sessionId, isNull);
  });
}
