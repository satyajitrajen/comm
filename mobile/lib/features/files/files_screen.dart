import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';

class FilesScreen extends ConsumerStatefulWidget {
  const FilesScreen({super.key});
  @override
  ConsumerState<FilesScreen> createState() => _FilesScreenState();
}

class _FilesScreenState extends ConsumerState<FilesScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final res = await ref.read(apiClientProvider).dio.get('/api/v1/files');
    final data = res.data;
    final list = data is List ? data : (data is Map && data['files'] is List ? data['files'] as List : []);
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Files')),
      floatingActionButton: FloatingActionButton(onPressed: _upload, child: const Icon(Icons.upload)),
      body: FutureBuilder(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return EmptyState(message: apiError(snap.error!), onRetry: () => setState(() => _future = _load()));
          }
          final items = snap.data ?? [];
          if (items.isEmpty) return const EmptyState(message: 'No files yet');
          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (context, i) {
              final f = items[i];
              return ListTile(
                leading: const Icon(Icons.insert_drive_file_outlined),
                title: Text('${f['originalName'] ?? f['name'] ?? 'File'}'),
                subtitle: Text('${f['mimeType'] ?? ''}'),
              );
            },
          );
        },
      ),
    );
  }
}
