import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth_notifier.dart';
import '../../core/file_downloader.dart';
import '../../widgets/common.dart';

class FilesScreen extends ConsumerStatefulWidget {
  const FilesScreen({super.key});
  @override
  ConsumerState<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends ConsumerState<FilesScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  final Set<String> _downloadingIds = {};

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final res = await ref.read(apiClientProvider).dio.get('/api/v1/files');
    final data = res.data;
    final list = data is List
        ? data
        : (data is Map && data['items'] is List
            ? data['items'] as List
            : (data is Map && data['files'] is List ? data['files'] as List : []));
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _upload() async {
    final picked = await FilePicker.platform.pickFiles();
    if (picked == null || picked.files.single.path == null) return;
    final file = picked.files.single;
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path!, filename: file.name),
    });
    await ref.read(apiClientProvider).dio.post('/api/v1/files', data: form);
    setState(() => _future = _load());
  }

  Future<void> _download(String fileId, String filename) async {
    if (fileId.isEmpty || _downloadingIds.contains(fileId)) return;
    setState(() => _downloadingIds.add(fileId));
    final api = ref.read(apiClientProvider);
    try {
      await FileDownloader.downloadAndOpen(
        context,
        filename: filename,
        url: '/api/v1/files/$fileId/download',
        api: api,
      );
    } finally {
      if (mounted) {
        setState(() => _downloadingIds.remove(fileId));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Files')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _upload,
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF0F172A),
        elevation: 3,
        shape: const StadiumBorder(),
        icon: const Icon(Icons.upload_file_rounded),
        label: const Text('Upload', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      body: FutureBuilder(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return EmptyState(
              message: apiError(snap.error!),
              onRetry: () => setState(() => _future = _load()),
            );
          }
          final items = snap.data ?? [];
          if (items.isEmpty) return const EmptyState(message: 'No files yet');
          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: items.length,
            itemBuilder: (context, i) {
              final f = items[i];
              final fileId = f['id']?.toString() ?? '';
              final filename = f['filename'] ?? f['originalName'] ?? f['name'] ?? 'File';
              final isDownloading = _downloadingIds.contains(fileId);

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: const [
                    BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 2)),
                  ],
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  leading: const CircleAvatar(
                    backgroundColor: Color(0xFFE0F2FE),
                    foregroundColor: Color(0xFF0284C7),
                    child: Icon(Icons.insert_drive_file_outlined, size: 20),
                  ),
                  title: Text(
                    filename.toString(),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    '${f['mimeType'] ?? ''}',
                    style: const TextStyle(color: Color(0xFF64748B)),
                  ),
                  trailing: isDownloading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : IconButton(
                          icon: const Icon(Icons.download_rounded, color: Color(0xFF0284C7)),
                          tooltip: 'Download',
                          onPressed: () => _download(fileId, filename.toString()),
                        ),
                  onTap: () => _download(fileId, filename.toString()),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
