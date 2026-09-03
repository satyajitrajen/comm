import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late final TextEditingController _name;
  late final TextEditingController _about;
  final _current = TextEditingController();
  final _next = TextEditingController();
  String _availability = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authProvider).user;
    _name = TextEditingController(text: user?['displayName'] as String? ?? '');
    _about = TextEditingController(text: user?['aboutText'] as String? ?? '');
    _availability = user?['availability'] as String? ?? '';
  }

  @override
  void dispose() {
    _name.dispose();
    _about.dispose();
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      final res = await ref.read(apiClientProvider).dio.patch(
        '/api/v1/users/profile',
        data: {
          'displayName': _name.text.trim(),
          'aboutText': _about.text.trim(),
          if (_availability.isNotEmpty) 'statusAvailability': _availability,
        },
      );
      final user = Map<String, dynamic>.from(ref.read(authProvider).user ?? {});
      user['displayName'] = _name.text.trim();
      user.addAll(Map<String, dynamic>.from(res.data is Map ? res.data as Map : {}));
      await ref.read(authProvider.notifier).updateLocalUser(user);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).user;
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: const [
                BoxShadow(color: Color(0x0A000000), blurRadius: 10, offset: Offset(0, 2)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: TtAvatar(name: user?['displayName'] as String? ?? 'U', url: user?['avatarUrl'] as String?, size: 48),
                  title: Text(user?['displayName'] as String? ?? user?['email'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  subtitle: Text(user?['workspaceName'] as String? ?? user?['email'] as String? ?? '', style: const TextStyle(color: Color(0xFF64748B))),
                ),
                const SizedBox(height: 12),
                TextField(controller: _name, decoration: const InputDecoration(labelText: 'Display name')),
                const SizedBox(height: 12),
                TextField(controller: _about, decoration: const InputDecoration(labelText: 'About'), maxLines: 2),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _availability.isEmpty ? null : _availability,
                  decoration: const InputDecoration(labelText: 'Availability'),
                  items: const [
                    DropdownMenuItem(value: 'AWAY', child: Text('Away')),
                    DropdownMenuItem(value: 'DND', child: Text('Do not disturb')),
                    DropdownMenuItem(value: 'OUT_OF_OFFICE', child: Text('Out of office')),
                  ],
                  onChanged: (v) => setState(() => _availability = v ?? ''),
                ),
                const SizedBox(height: 18),
                FilledButton(
                  style: FilledButton.styleFrom(shape: const StadiumBorder()),
                  onPressed: _busy ? null : _save,
                  child: const Text('Save profile'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: const [
                BoxShadow(color: Color(0x0A000000), blurRadius: 10, offset: Offset(0, 2)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Security & Password', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const SizedBox(height: 12),
                TextField(controller: _current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
                const SizedBox(height: 12),
                TextField(controller: _next, obscureText: true, decoration: const InputDecoration(labelText: 'New password')),
                const SizedBox(height: 16),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    shape: const StadiumBorder(),
                    minimumSize: const Size.fromHeight(52),
                    side: const BorderSide(color: Color(0xFF0284C7)),
                  ),
                  onPressed: () async {
                    if (_current.text.isEmpty || _next.text.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Please enter current and new password')),
                      );
                      return;
                    }
                    try {
                      await ref.read(authProvider.notifier).changePassword(
                            currentPassword: _current.text,
                            newPassword: _next.text,
                          );
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Password updated — please sign in again')),
                      );
                      await ref.read(authProvider.notifier).logout();
                    } catch (e) {
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
                    }
                  },
                  child: const Text('Update password', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFFE11D48),
              shape: const StadiumBorder(),
              minimumSize: const Size.fromHeight(52),
            ),
            icon: const Icon(Icons.logout_rounded),
            onPressed: () => ref.read(authProvider.notifier).logout(),
            label: const Text('Log out', style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
