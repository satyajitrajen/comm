/// Maps backend push `data.url` (web paths) onto Flutter go_router locations.
String routeFromPushUrl(String? url) {
  if (url == null || url.isEmpty) return '/home';
  final raw = url.startsWith('http') ? url : 'https://app.local$url';
  final uri = Uri.tryParse(raw);
  if (uri == null) return '/home';

  final conversation = uri.queryParameters['conversation'];
  final path = uri.path;
  if (conversation != null && conversation.isNotEmpty) {
    if (path.startsWith('/dms')) {
      return '/chat/$conversation?type=DIRECT';
    }
    if (path.startsWith('/calls')) {
      return '/calls';
    }
    return '/chat/$conversation?type=GROUP';
  }
  if (path.startsWith('/activity')) return '/activity';
  if (path.startsWith('/calls')) return '/calls';
  if (path.startsWith('/dms')) return '/dms';
  if (path.startsWith('/teams')) return '/teams';
  if (path.startsWith('/chat/')) return path;
  return '/home';
}
