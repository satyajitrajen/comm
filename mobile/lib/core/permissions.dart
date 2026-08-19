bool navKeyAllowed(String navKey, Map<String, dynamic>? user) {
  if (navKey == 'settings' || navKey == 'calls') return true;
  final keys = user?['allowedNavKeys'];
  if (keys is! List || keys.isEmpty) return true;
  return keys.map((e) => e.toString()).contains(navKey);
}
