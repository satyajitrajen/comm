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
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: TtAvatar(name: user?['displayName'] as String? ?? 'U', url: user?['avatarUrl'] as String?),
            title: Text(user?['email'] as String? ?? ''),
            subtitle: Text(user?['workspaceName'] as String? ?? ''),
          ),
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
          const SizedBox(height: 16),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Save profile')),
          const Divider(height: 40),
          const Text('Change password', style: TextStyle(fontWeight: FontWeight.w600)),
          TextField(controller: _current, obscureText: true, decoration: const InputDecoration(labelText: 'Current')),
          const SizedBox(height: 8),
          TextField(controller: _next, obscureText: true, decoration: const InputDecoration(labelText: 'New')),
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: () async {
              try {
                await ref.read(authProvider.notifier).changePassword(
                      currentPassword: _current.text,
                      newPassword: _next.text,
                    );
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password updated')));
              } catch (e) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
              }
            },
            child: const Text('Update password'),
          ),
          const Divider(height: 40),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFFE11D48)),
            onPressed: () => ref.read(authProvider.notifier).logout(),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
  }
}
