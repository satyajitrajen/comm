import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureSession {
  SecureSession({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _access = 'veloce_token';
  static const _refresh = 'veloce_refresh';
  static const _session = 'veloce_session';
  static const _user = 'veloce_user';
  static const _apiOverride = 'api_base_override';

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
    required String sessionId,
  }) async {
    await _storage.write(key: _access, value: accessToken);
    await _storage.write(key: _refresh, value: refreshToken);
    await _storage.write(key: _session, value: sessionId);
  }

  Future<void> saveUserJson(String json) => _storage.write(key: _user, value: json);

  Future<String?> get accessToken => _storage.read(key: _access);
  Future<String?> get refreshToken => _storage.read(key: _refresh);
  Future<String?> get sessionId => _storage.read(key: _session);
  Future<String?> get userJson => _storage.read(key: _user);
  Future<String?> get apiOverride => _storage.read(key: _apiOverride);

  Future<void> setApiOverride(String? url) async {
    if (url == null || url.isEmpty) {
      await _storage.delete(key: _apiOverride);
    } else {
      await _storage.write(key: _apiOverride, value: url);
    }
  }

  Future<void> clear() async {
    await _storage.delete(key: _access);
    await _storage.delete(key: _refresh);
    await _storage.delete(key: _session);
    await _storage.delete(key: _user);
  }
}
