import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import 'fcm.dart';
import 'session.dart';

final sessionProvider = Provider<SecureSession>((ref) => SecureSession());

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(sessionProvider));
});

class AuthState {
  const AuthState({this.user, this.booting = true});
  final Map<String, dynamic>? user;
  final bool booting;
  bool get isLoggedIn => user != null;
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(_hydrate);
    return const AuthState(booting: true);
  }

  SecureSession get _session => ref.read(sessionProvider);
  ApiClient get _api => ref.read(apiClientProvider);

  Future<void> _hydrate() async {
    final token = await _session.accessToken;
    final json = await _session.userJson;
    if (token == null || json == null) {
      state = const AuthState(booting: false);
      return;
    }
    try {
      state = AuthState(
        user: jsonDecode(json) as Map<String, dynamic>,
        booting: false,
      );
      await registerAndroidPush(_api);
    } catch (_) {
      state = const AuthState(booting: false);
    }
  }

  Future<Map<String, dynamic>> login({
    required String identifier,
    required String password,
  }) async {
    final isEmail = identifier.contains('@');
    final res = await _api.dio.post<Map<String, dynamic>>(
      '/api/v1/auth/login',
      data: {
        if (isEmail) 'email': identifier else 'phoneNumber': identifier,
        'password': password,
      },
    );
    final data = res.data ?? {};
    if (data['needsTwoFactor'] == true) return data;
    await _persist(data);
    return data;
  }

  Future<void> verify2fa({
    required String verifyKey,
    required String otpCode,
  }) async {
    final res = await _api.dio.post<Map<String, dynamic>>(
      '/api/v1/auth/verify-2fa',
      data: {'verifyKey': verifyKey, 'otpCode': otpCode},
    );
    await _persist(res.data ?? {});
  }

  Future<void> forgotPassword(String email) async {
    await _api.dio.post('/api/v1/auth/forgot-password', data: {'email': email});
  }

  Future<void> resetPassword({
    required String token,
    required String password,
  }) async {
    await _api.dio.post(
      '/api/v1/auth/reset-password',
      data: {'token': token, 'password': password},
    );
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _api.dio.post(
      '/api/v1/auth/change-password',
      data: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
  }

  Future<void> logout() async {
    try {
      await unregisterAndroidPush(_api);
    } catch (_) {}
    final sessionId = await _session.sessionId;
    final refresh = await _session.refreshToken;
    try {
      if (sessionId != null && refresh != null) {
        await _api.dio.post(
          '/api/v1/auth/logout',
          data: {'sessionId': sessionId, 'refreshToken': refresh},
          options: Options(headers: {'X-Skip-Auth-Refresh': '1'}),
        );
      }
    } catch (_) {}
    await _session.clear();
    state = const AuthState(booting: false);
  }

  Future<void> updateLocalUser(Map<String, dynamic> user) async {
    await _session.saveUserJson(jsonEncode(user));
    state = AuthState(user: user, booting: false);
  }

  Future<void> _persist(Map<String, dynamic> data) async {
    final access = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    final sessionId = data['sessionId'] as String?;
    final user = data['user'];
    if (access == null || refresh == null || sessionId == null) {
      throw StateError('Incomplete auth payload');
    }
    await _session.saveTokens(
      accessToken: access,
      refreshToken: refresh,
      sessionId: sessionId,
    );
    if (user is Map<String, dynamic>) {
      await _session.saveUserJson(jsonEncode(user));
      state = AuthState(user: user, booting: false);
      await registerAndroidPush(_api);
    } else {
      state = const AuthState(booting: false);
    }
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
