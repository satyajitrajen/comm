import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

/// Requests mic + camera before joining a Jitsi call. Returns false (with a
/// SnackBar) when the microphone — the minimum a call needs — is denied.
Future<bool> ensureCallPermissions(BuildContext context) async {
  final mic = await Permission.microphone.request();
  await Permission.camera.request();
  if (mic.isGranted || mic.isLimited) return true;
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Microphone permission is required to join calls'),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Color(0xFFEF4444),
      ),
    );
  }
  return false;
}
