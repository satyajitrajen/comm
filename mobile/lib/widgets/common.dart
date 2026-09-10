import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/auth_notifier.dart';

String initialsFor(String? name) {
  final parts = (name ?? 'U').trim().split(RegExp(r'\s+'));
  return parts.take(2).map((p) => p.isEmpty ? '' : p[0]).join().toUpperCase();
}

/// Loads a backend file (`/api/v1/files/:id/view`) with the bearer token
/// attached, backed by the disk cache so list scrolling does not re-download.
class AuthImage extends ConsumerStatefulWidget {
  const AuthImage({
    super.key,
    required this.fileId,
    this.fit,
    this.width,
    this.height,
    this.memCacheWidth,
    this.placeholder,
    this.errorWidget,
  });

  final String fileId;
  final BoxFit? fit;
  final double? width;
  final double? height;
  final int? memCacheWidth;
  final WidgetBuilder? placeholder;
  final WidgetBuilder? errorWidget;

  @override
  ConsumerState<AuthImage> createState() => _AuthImageState();
}

class _AuthImageState extends ConsumerState<AuthImage> {
  String? _token;
  String? _baseUrl;
  bool _failed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final api = ref.read(apiClientProvider);
    _baseUrl = api.baseUrl;
    if (_token == null && !_failed) {
      _loadToken();
    }
  }

  Future<void> _loadToken() async {
    final token = await ref.read(sessionProvider).accessToken;
    if (!mounted) return;
    if (token == null) {
      setState(() => _failed = true);
      return;
    }
    setState(() => _token = token);
  }

  @override
  Widget build(BuildContext context) {
    if (_failed || _token == null || _baseUrl == null) {
      final fallback = _failed ? widget.errorWidget : widget.placeholder;
      if (fallback != null) return fallback(context);
      return SizedBox(width: widget.width, height: widget.height);
    }
    return CachedNetworkImage(
      imageUrl: '$_baseUrl/api/v1/files/${widget.fileId}/view',
      httpHeaders: {'Authorization': 'Bearer $_token'},
      fit: widget.fit,
      width: widget.width,
      height: widget.height,
      memCacheWidth: widget.memCacheWidth,
      fadeInDuration: const Duration(milliseconds: 150),
      placeholder: (context, url) =>
          widget.placeholder?.call(context) ?? const SizedBox.shrink(),
      errorWidget: (context, url, error) =>
          widget.errorWidget?.call(context) ?? const SizedBox.shrink(),
    );
  }
}

class TtAvatar extends StatelessWidget {
  const TtAvatar({super.key, required this.name, this.url, this.size = 40});
  final String name;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final image = url;
    // Only absolute http(s) URLs load; avatars live on a public CDN
    // (Cloudinary), so no Authorization header is attached — sending the
    // bearer token to an arbitrary user-provided host would leak it.
    final showImage = image != null && image.startsWith('http');
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: const Color(0xFF0284C7),
      backgroundImage: showImage ? NetworkImage(image) : null,
      child: showImage
          ? null
          : Text(
              initialsFor(name),
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: size * 0.35,
              ),
            ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                boxShadow: const [
                  BoxShadow(color: Color(0x0F000000), blurRadius: 10, offset: Offset(0, 3)),
                ],
              ),
              child: const Icon(Icons.inbox_rounded, color: Color(0xFF94A3B8), size: 28),
            ),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF64748B), fontSize: 15)),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              FilledButton.icon(
                style: FilledButton.styleFrom(shape: const StadiumBorder()),
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded, size: 18),
                label: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

String apiError(Object error) {
  final text = error.toString();
  final match = RegExp(r'"message"\s*:\s*"([^"]+)"').firstMatch(text);
  if (match != null) return match.group(1)!;
  return 'Something went wrong. Check the API host and try again.';
}
