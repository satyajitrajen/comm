import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/auth_notifier.dart';
import '../../widgets/common.dart';
import '../calls/call_controller.dart';

class EventsScreen extends ConsumerStatefulWidget {
  const EventsScreen({super.key});

  @override
  ConsumerState<EventsScreen> createState() => _EventsScreenState();
}

class _EventsScreenState extends ConsumerState<EventsScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  String _filter = 'upcoming'; // upcoming, today, all

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final res = await ref.read(apiClientProvider).dio.get('/api/v1/calendar/events');
    final data = res.data;
    final list = data is List
        ? data
        : (data is Map && data['items'] is List
            ? data['items'] as List
            : (data is Map && data['events'] is List ? data['events'] as List : []));
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  List<Map<String, dynamic>> _applyFilter(List<Map<String, dynamic>> all) {
    final now = DateTime.now();
    final todayStart = DateTime(now.year, now.month, now.day);
    final todayEnd = DateTime(now.year, now.month, now.day, 23, 59, 59);

    return all.where((e) {
      final startsAtStr = e['startsAt'] as String?;
      if (startsAtStr == null) return true;
      final startsAt = DateTime.tryParse(startsAtStr);
      if (startsAt == null) return true;

      if (_filter == 'upcoming') {
        return startsAt.isAfter(now.subtract(const Duration(minutes: 30)));
      } else if (_filter == 'today') {
        return startsAt.isAfter(todayStart) && startsAt.isBefore(todayEnd);
      }
      return true;
    }).toList()
      ..sort((a, b) {
        final dateA = DateTime.tryParse(a['startsAt'] as String? ?? '') ?? DateTime.now();
        final dateB = DateTime.tryParse(b['startsAt'] as String? ?? '') ?? DateTime.now();
        return dateA.compareTo(dateB);
      });
  }

  String _formatDateTime(String? dateStr) {
    if (dateStr == null) return '';
    final dt = DateTime.tryParse(dateStr)?.toLocal();
    if (dt == null) return dateStr;
    final now = DateTime.now();
    final isToday = dt.year == now.year && dt.month == now.month && dt.day == now.day;
    if (isToday) {
      return 'Today at ${DateFormat('h:mm a').format(dt)}';
    }
    return DateFormat('EEE, MMM d • h:mm a').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Calendar & Events'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            child: Row(
              children: [
                _filterChip('Upcoming', 'upcoming'),
                const SizedBox(width: 8),
                _filterChip('Today', 'today'),
                const SizedBox(width: 8),
                _filterChip('All Events', 'all'),
              ],
            ),
          ),
        ),
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
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

          final allEvents = snap.data ?? [];
          final events = _applyFilter(allEvents);

          if (events.isEmpty) {
            return RefreshIndicator(
              onRefresh: () async => setState(() => _future = _load()),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  SizedBox(height: MediaQuery.of(context).size.height * 0.25),
                  EmptyState(
                    message: _filter == 'upcoming'
                        ? 'No upcoming events or meetings'
                        : _filter == 'today'
                            ? 'No events scheduled for today'
                            : 'No events found in calendar',
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => setState(() => _future = _load()),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: events.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final event = events[index];
                final title = event['title'] as String? ?? 'Meeting';
                final desc = event['description'] as String?;
                final startsAt = event['startsAt'] as String?;
                final meetingLink = event['meetingLink'] as String?;
                final teamName = event['teamName'] as String?;
                final organizer = event['organizer']?['displayName'] as String? ??
                    event['creator']?['displayName'] as String?;
                final attendees = (event['attendees'] as List?) ?? [];

                return Card(
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFFEFF6FF),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.calendar_today_rounded,
                                color: Color(0xFF1D4ED8),
                                size: 20,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      color: Color(0xFF0F172A),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Row(
                                    children: [
                                      const Icon(
                                        Icons.access_time_rounded,
                                        size: 14,
                                        color: Color(0xFF64748B),
                                      ),
                                      const SizedBox(width: 4),
                                      Text(
                                        _formatDateTime(startsAt),
                                        style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500,
                                          color: Color(0xFF64748B),
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                            if (teamName != null && teamName.isNotEmpty)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF1F5F9),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  teamName,
                                  style: const TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: Color(0xFF475569),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        if (desc != null && desc.trim().isNotEmpty) ...[
                          const SizedBox(height: 10),
                          Text(
                            desc.trim(),
                            style: const TextStyle(fontSize: 13, color: Color(0xFF475569)),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                        const SizedBox(height: 12),
                        const Divider(height: 1),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            if (organizer != null) ...[
                              const Icon(Icons.person_outline, size: 14, color: Color(0xFF94A3B8)),
                              const SizedBox(width: 4),
                              Text(
                                organizer,
                                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                              ),
                              const SizedBox(width: 12),
                            ],
                            if (attendees.isNotEmpty) ...[
                              const Icon(Icons.people_outline, size: 14, color: Color(0xFF94A3B8)),
                              const SizedBox(width: 4),
                              Text(
                                '${attendees.length} attendee${attendees.length > 1 ? 's' : ''}',
                                style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                              ),
                            ],
                            const Spacer(),
                            if (meetingLink != null && meetingLink.isNotEmpty)
                              FilledButton.icon(
                                style: FilledButton.styleFrom(
                                  backgroundColor: const Color(0xFF1D4ED8),
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                ),
                                icon: const Icon(Icons.videocam_rounded, size: 16),
                                label: const Text('Join Room', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                                onPressed: () {
                                  final room = Uri.tryParse(meetingLink)?.pathSegments.lastOrNull ??
                                      meetingLink.split('/').last;
                                  final me = ref.read(authProvider).user;
                                  ref.read(callControllerProvider.notifier).joinRoom(
                                        room,
                                        conversationId: event['conversationId'] as String? ?? event['id'] as String?,
                                        displayName: me?['displayName'] as String?,
                                      );
                                },
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }

  Widget _filterChip(String label, String value) {
    final active = _filter == value;
    return GestureDetector(
      onTap: () => setState(() => _filter = value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: active ? const Color(0xFF1D4ED8) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active ? const Color(0xFF1D4ED8) : const Color(0xFFE2E8F0),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: active ? Colors.white : const Color(0xFF64748B),
          ),
        ),
      ),
    );
  }
}
