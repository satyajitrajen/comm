import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:open_filex/open_filex.dart';
import 'package:permission_handler/permission_handler.dart';

import 'api_client.dart';

class FileDownloader {
  static const _channel = MethodChannel('teamtime/downloads');

  /// Downloads [url] with the auth header, saves it to the public Downloads
  /// folder via the platform channel (MediaStore on API 29+), and opens it.
  static Future<void> downloadAndOpen(
    BuildContext context, {
    required String filename,
    required String url,
    required ApiClient api,
    void Function(double progress)? onProgress,
  }) async {
    try {
      final downloadUrl = url.startsWith('http')
          ? url
          : '${api.baseUrl}${url.startsWith('/') ? '' : '/'}$url';

      final res = await api.dio.get<List<int>>(
        downloadUrl,
        options: Options(responseType: ResponseType.bytes),
        onReceiveProgress: (received, total) {
          if (total > 0 && onProgress != null) onProgress(received / total);
        },
      );
      final Uint8List bytes;
      final raw = res.data;
      if (raw == null || raw.isEmpty) {
        throw Exception('Server returned an empty file');
      }
      bytes = Uint8List.fromList(raw);

      final safeName = filename.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
      final mimeType = res.headers.value(Headers.contentTypeHeader) ?? 'application/octet-stream';
      final saved = await _saveFile(bytes, safeName, mimeType);

      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Downloaded $safeName'),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
          action: SnackBarAction(
            label: 'Open',
            textColor: const Color(0xFF38BDF8),
            onPressed: () async {
              final result = await OpenFilex.open(saved);
              if (result.type != ResultType.done && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Saved to Downloads: $saved'),
                    behavior: SnackBarBehavior.floating,
                  ),
                );
              }
            },
          ),
        ),
      );
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Download failed: ${e.toString()}'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: const Color(0xFFEF4444),
        ),
      );
    }
  }

  static Future<String> _saveFile(
    Uint8List bytes,
    String fileName,
    String mimeType,
  ) async {
    if (!Platform.isAndroid) {
      throw UnsupportedError('Saving to Downloads is only supported on Android');
    }
    try {
      return await _invokeSave(bytes, fileName, mimeType);
    } on PlatformException catch (e) {
      if (e.code != 'permission_required') rethrow;
      final status = await Permission.storage.request();
      if (!status.isGranted) {
        throw Exception('Storage permission denied');
      }
      return _invokeSave(bytes, fileName, mimeType);
    }
  }

  static Future<String> _invokeSave(
    Uint8List bytes,
    String fileName,
    String mimeType,
  ) async {
    final saved = await _channel.invokeMapMethod<String, String>(
      'saveFile',
      {'bytes': bytes, 'fileName': fileName, 'mimeType': mimeType},
    );
    final path = saved?['path'];
    if (path == null || path.isEmpty) {
      throw Exception('Could not determine where the file was saved');
    }
    return path;
  }
}
