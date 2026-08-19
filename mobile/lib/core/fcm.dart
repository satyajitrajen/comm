import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'api_client.dart';
import 'firebase_bootstrap.dart';
import 'push_routes.dart';

String? _pendingPushRoute;
bool _routingAttached = false;
bool _tokenRefreshAttached = false;
void Function(String route)? _go;

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // System tray already shows the FCM notification payload. This isolate
  // exists so the plugin does not drop background messages.
}

String? takePendingPushRoute() {
  final route = _pendingPushRoute;
  _pendingPushRoute = null;
  return route;
}

void _openFromMessage(RemoteMessage message) {
  final route = routeFromPushUrl(message.data['url']);
  final go = _go;
  if (go != null) {
    go(route);
  } else {
    _pendingPushRoute = route;
  }
}

Future<void> attachPushRouting(void Function(String route) go) async {
  _go = go;
  if (!FirebaseBootstrap.ready || _routingAttached) {
    final pending = takePendingPushRoute();
    if (pending != null) go(pending);
    return;
  }
  _routingAttached = true;
  FirebaseMessaging.onMessageOpenedApp.listen(_openFromMessage);
  final initial = await FirebaseMessaging.instance.getInitialMessage();
  if (initial != null) {
    _openFromMessage(initial);
  }
  final pending = takePendingPushRoute();
  if (pending != null) go(pending);
}

Future<void> registerAndroidPush(ApiClient api) async {
  if (!FirebaseBootstrap.ready) return;
  try {
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission();
    final token = await messaging.getToken();
    if (token == null || token.isEmpty) return;
    await api.dio.post(
      '/api/v1/notifications/push/subscribe',
      data: {'token': token, 'deviceType': 'ANDROID'},
    );
    if (!_tokenRefreshAttached) {
      _tokenRefreshAttached = true;
      messaging.onTokenRefresh.listen((refreshed) async {
        if (refreshed.isEmpty) return;
        try {
          await api.dio.post(
            '/api/v1/notifications/push/subscribe',
            data: {'token': refreshed, 'deviceType': 'ANDROID'},
          );
        } catch (e) {
          debugPrint('FCM token refresh skipped: $e');
        }
      });
    }
  } catch (e) {
    debugPrint('FCM register skipped: $e');
  }
}

Future<void> unregisterAndroidPush(ApiClient api) async {
  if (!FirebaseBootstrap.ready) return;
  try {
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null) return;
    await api.dio.delete(
      '/api/v1/notifications/push/subscribe',
      data: {'token': token, 'deviceType': 'ANDROID'},
    );
  } catch (_) {}
}
