import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'api_client.dart';
import 'firebase_bootstrap.dart';
import 'push_routes.dart';

const _pushChannelId = 'teamtime_push';
final _localNotifications = FlutterLocalNotificationsPlugin();

Future<void> initLocalNotifications() async {
  try {
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: androidSettings);
    await _localNotifications.initialize(
      settings: settings,
      onDidReceiveNotificationResponse: (response) {
        if (response.actionId == 'decline_call') {
          cancelIncomingCallNotification();
          return;
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
}) async {
  try {
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
