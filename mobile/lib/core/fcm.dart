import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_client.dart';
import 'firebase_bootstrap.dart';
import 'push_routes.dart';

const _pushChannelId = 'teamtime_push';
const _callAcceptRouteKey = 'pending_call_accept_route';
final _localNotifications = FlutterLocalNotificationsPlugin();
final _secureStorage = const FlutterSecureStorage();

/// Wired by the app shell so notification actions can drive call UI.
void Function()? _onForegroundDecline;
void Function()? _onForegroundAccept;

void setCallNotificationHandlers({
  void Function()? onDecline,
  void Function()? onAccept,
}) {
  _onForegroundDecline = onDecline;
  _onForegroundAccept = onAccept;
}

/// Called when a call notification is shown: stages the accept route so a
/// cold start (or background accept) can route the user into the
/// conversation, where the join banner lives. Expires with the ring window.
Future<void> _stageCallAcceptRoute(String? conversationId, String? conversationType) async {
  if (conversationId == null || conversationId.isEmpty) return;
  final type = conversationType == 'DIRECT' ? 'DIRECT' : 'GROUP';
  final payload =
      '${DateTime.now().millisecondsSinceEpoch}|/chat/$conversationId?type=$type';
  try {
    await _secureStorage.write(key: _callAcceptRouteKey, value: payload);
  } catch (_) {}
}

/// Returns the staged accept route if it is fresh (<60s old), else clears it.
Future<String?> consumePendingCallAcceptRoute() async {
  try {
    final payload = await _secureStorage.read(key: _callAcceptRouteKey);
    if (payload == null || payload.isEmpty) return null;
    await _secureStorage.delete(key: _callAcceptRouteKey);
    final sep = payload.indexOf('|');
    if (sep <= 0) return null;
    final stagedAt = int.tryParse(payload.substring(0, sep));
    if (stagedAt == null) return null;
    if (DateTime.now().millisecondsSinceEpoch - stagedAt > 60000) return null;
    return payload.substring(sep + 1);
  } catch (_) {
    return null;
  }
}

Future<void> _clearStagedCallAcceptRoute() async {
  try {
    await _secureStorage.delete(key: _callAcceptRouteKey);
  } catch (_) {}
}

@pragma('vm:entry-point')
Future<void> notificationBackgroundActionHandler(NotificationResponse response) async {
  if (response.id != 8888) return;
  if (response.actionId == 'accept_call') {
    // Route already staged when the notification was shown; nothing to do
    // here — the app picks it up on launch/resume.
    return;
  }
  if (response.actionId == 'decline_call') {
    await _clearStagedCallAcceptRoute();
  }
}

Future<void> initLocalNotifications() async {
  try {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: androidSettings);
    await _localNotifications.initialize(
      settings: settings,
      onDidReceiveNotificationResponse: (response) {
        if (response.id == 8888) {
          if (response.actionId == 'decline_call') {
            cancelIncomingCallNotification();
            _onForegroundDecline?.call();
            return;
          }
          if (response.actionId == 'accept_call') {
            cancelIncomingCallNotification();
            _onForegroundAccept?.call();
            return;
          }
          // Plain tap on the call notification behaves like accept.
          if (response.payload != null && response.payload!.startsWith('/calls?conversation=')) {
            cancelIncomingCallNotification();
            _onForegroundAccept?.call();
            return;
          }
        }
        if (response.payload != null && response.payload!.isNotEmpty) {
          final route = routeFromPushUrl(response.payload);
          final go = _go;
          if (go != null) {
            go(route);
          } else {
            _pendingPushRoute = route;
          }
        }
      },
      onDidReceiveBackgroundNotificationResponse: notificationBackgroundActionHandler,
    );
  } catch (e) {
    debugPrint('initLocalNotifications error: $e');
  }
  await _ensureAndroidPushChannel();
}

Future<void> _ensureAndroidPushChannel() async {
  try {
    final android = _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        _pushChannelId,
        'TeamTime push',
        description: 'Calls, messages and workspace alerts',
        importance: Importance.max,
        playSound: true,
        enableVibration: true,
      ),
    );
  } catch (e) {
    debugPrint('Notification channel skipped: $e');
  }
}

Future<void> showIncomingCallNotification({
  required String callerName,
  required String conversationName,
  required String conversationId,
  String? conversationType,
}) async {
  try {
    await _stageCallAcceptRoute(conversationId, conversationType);
    const androidDetails = AndroidNotificationDetails(
      _pushChannelId,
      'TeamTime push',
      channelDescription: 'Calls, messages and workspace alerts',
      importance: Importance.max,
      priority: Priority.high,
      fullScreenIntent: true,
      category: AndroidNotificationCategory.call,
      visibility: NotificationVisibility.public,
      playSound: true,
      enableVibration: true,
      actions: [
        AndroidNotificationAction(
          'decline_call',
          'Decline',
          showsUserInterface: false,
          cancelNotification: true,
        ),
        AndroidNotificationAction(
          'accept_call',
          'Accept',
          showsUserInterface: true,
        ),
      ],
    );
    await _localNotifications.show(
      id: 8888,
      title: 'Incoming Call',
      body: '$callerName is calling in $conversationName',
      notificationDetails: const NotificationDetails(android: androidDetails),
      payload: '/calls?conversation=$conversationId',
    );
  } catch (e) {
    debugPrint('showIncomingCallNotification error: $e');
  }
}

Future<void> cancelIncomingCallNotification() async {
  try {
    await _localNotifications.cancel(id: 8888);
    await _clearStagedCallAcceptRoute();
  } catch (_) {}
}

String? _pendingPushRoute;
bool _routingAttached = false;
bool _tokenRefreshAttached = false;
void Function(String route)? _go;

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await FirebaseBootstrap.init();
  } catch (_) {}
  final data = message.data;
  final title = message.notification?.title ?? data['title'] ?? '';
  final isCall = data['type'] == 'CALL_INVITE' ||
      title.toString().toLowerCase().contains('call') ||
      (data['url']?.toString().contains('calls') ?? false);

  if (isCall) {
    final callerName = data['callerName'] ?? 'Someone';
    final conversationName = data['conversationName'] ?? 'TeamTime';
    final conversationId = data['conversationId'] ?? '';
    await initLocalNotifications();
    await showIncomingCallNotification(
      callerName: callerName.toString(),
      conversationName: conversationName.toString(),
      conversationId: conversationId.toString(),
      conversationType: data['conversationType']?.toString(),
    );
  }
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
    final acceptRoute = await consumePendingCallAcceptRoute();
    if (acceptRoute != null) go(acceptRoute);
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
  final acceptRoute = await consumePendingCallAcceptRoute();
  if (acceptRoute != null) go(acceptRoute);
}

Future<void> registerAndroidPush(ApiClient api, {int retryCount = 0}) async {
  if (!FirebaseBootstrap.ready) return;
  await _ensureAndroidPushChannel();
  try {
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission();
    final token = await messaging.getToken();
    if (token == null || token.isEmpty) return;
    await api.dio.post(
      '/api/v1/notifications/push/subscribe',
      data: {'token': token, 'deviceType': 'ANDROID'},
    );
    debugPrint('[FCM] Successfully registered push token with server');
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
    if (retryCount < 6) {
      Future.delayed(Duration(seconds: 3 * (retryCount + 1)), () {
        registerAndroidPush(api, retryCount: retryCount + 1);
      });
    }
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
