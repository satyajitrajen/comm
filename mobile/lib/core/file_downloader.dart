import 'dart:io';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'api_client.dart';

class FileDownloader {
  /// Downloads a file from the server or remote URL, saves to device storage,
  /// and opens the file using OpenFilex.
  static Future<void> downloadAndOpen(
    BuildContext context, {
    required String filename,
    required String url,
    required ApiClient api,
    void Function(double progress)? onProgress,
  }) async {
    try {
      // 1. Resolve save directory
      Directory? targetDir;
      try {
        final publicDownload = Directory('/storage/emulated/0/Download');
        if (publicDownload.existsSync()) {
          targetDir = publicDownload;
        }
      } catch (_) {}

      targetDir ??= await getDownloadsDirectory() ?? await getApplicationDocumentsDirectory();

      // Clean filename to avoid directory traversal
      final safeName = filename.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
      final savePath = '${targetDir.path}/$safeName';

      // 2. Prepare URL
      final downloadUrl = url.startsWith('http')
          ? url
          : '${api.baseUrl}${url.startsWith('/') ? '' : '/'}$url';

      await api.dio.download(
        downloadUrl,
        savePath,
        onReceiveProgress: (received, total) {
          if (total > 0 && onProgress != null) {
            onProgress(received / total);
          }
        },
      );

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Downloaded $safeName'),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
          action: SnackBarAction(
            label: 'Open',
            textColor: const Color(0xFF38BDF8),
            onPressed: () {
              OpenFilex.open(savePath);
            },
          ),
        ),
      );

      // Automatically attempt to open the file
      await OpenFilex.open(savePath);
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
}
