import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'config.dart';
import 'session.dart';

class ApiClient {
  ApiClient(this._session) {
    final isRelease = kReleaseMode;
    _baseUrl = AppConfig.apiBaseUrl(isRelease: isRelease);
    dio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 30),
      ),
    );
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final override = await _session.apiOverride;
          if (override != null && override.isNotEmpty) {
            options.baseUrl = override;
          }
          final skip = options.headers['X-Skip-Auth-Refresh'] == '1';
          if (!skip) {
            final token = await _session.accessToken;
            if (token != null) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final status = error.response?.statusCode;
          final skip = error.requestOptions.headers['X-Skip-Auth-Refresh'] == '1';
          if (status != 401 || skip || error.requestOptions.extra['_retry'] == true) {
            handler.next(error);
            return;
          }
          final refreshed = await _refresh();
          if (refreshed == null) {
            await _session.clear();
            handler.next(error);
            return;
          }
          final req = error.requestOptions;
          req.extra['_retry'] = true;
          req.headers['Authorization'] = 'Bearer $refreshed';
          try {
            final clone = await dio.fetch(req);
            handler.resolve(clone);
          } catch (e) {
            handler.next(error);
          }
        },
      ),
    );
  }

  final SecureSession _session;
  late final Dio dio;
  late String _baseUrl;

  String get baseUrl => _baseUrl;

  Future<String?> _refresh() async {
    final sessionId = await _session.sessionId;
    final refresh = await _session.refreshToken;
    if (sessionId == null || refresh == null) return null;
    try {
      final res = await dio.post<Map<String, dynamic>>(
        '/api/v1/auth/refresh',
        data: {'sessionId': sessionId, 'refreshToken': refresh},
        options: Options(headers: {'X-Skip-Auth-Refresh': '1'}),
      );
      final data = res.data;
      if (data == null) return null;
      final access = data['accessToken'] as String?;
      final newRefresh = data['refreshToken'] as String?;
      final newSession = data['sessionId'] as String?;
      if (access == null || newRefresh == null || newSession == null) return null;
      await _session.saveTokens(
        accessToken: access,
        refreshToken: newRefresh,
        sessionId: newSession,
      );
      return access;
    } catch (_) {
      return null;
    }
  }
}
