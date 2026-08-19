import 'package:flutter/material.dart';

String initialsFor(String? name) {
  final parts = (name ?? 'U').trim().split(RegExp(r'\s+'));
  return parts.take(2).map((p) => p.isEmpty ? '' : p[0]).join().toUpperCase();
}

class TtAvatar extends StatelessWidget {
  const TtAvatar({super.key, required this.name, this.url, this.size = 40});
  final String name;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final image = url;
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: const Color(0xFF0284C7),
      backgroundImage: image != null && image.isNotEmpty ? NetworkImage(image) : null,
      child: image == null || image.isEmpty
          ? Text(
              initialsFor(name),
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: size * 0.35,
              ),
            )
          : null,
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
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF64748B))),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              FilledButton(onPressed: onRetry, child: const Text('Retry')),
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
