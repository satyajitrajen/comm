import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

class FirebaseBootstrap {
  FirebaseBootstrap._();

  static bool ready = false;
  static FirebaseAnalytics? analytics;

  static Future<void> init() async {
    try {
      await Firebase.initializeApp();
      ready = true;
      analytics = FirebaseAnalytics.instance;
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
      PlatformDispatcher.instance.onError = (error, stack) {
        FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
        return true;
      };
    } catch (error, stack) {
      ready = false;
      debugPrint('Firebase unavailable (expected without google-services.json): $error');
      debugPrint('$stack');
    }
  }
}
