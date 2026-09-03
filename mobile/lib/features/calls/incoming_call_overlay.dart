import 'dart:async';
import 'dart:math' as math;
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'call_controller.dart';

/// Fullscreen Outgoing Calling Screen matching the reference design:
/// deep purple-indigo ambient gradient, dynamic timer, contact headline,
/// smiley face visualizer with animated audio waveform, and bottom action buttons (Speaker, End, Mute).
class OutgoingCallOverlay extends ConsumerStatefulWidget {
  const OutgoingCallOverlay({super.key, required this.outgoing});
  final OutgoingCall outgoing;

  @override
  ConsumerState<OutgoingCallOverlay> createState() => _OutgoingCallOverlayState();
}

class _OutgoingCallOverlayState extends ConsumerState<OutgoingCallOverlay> {
  Timer? _timer;
  AudioPlayer? _player;
  int _seconds = 0;
  bool _speakerOn = false;
  bool _isMuted = false;

  @override
  void initState() {
    super.initState();
    _startRingtone();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() => _seconds++);
      }
    });
  }

  void _startRingtone() async {
    try {
      final player = AudioPlayer();
      _player = player;
      await player.setReleaseMode(ReleaseMode.loop);
      await player.setSource(AssetSource('audio/ringtone.mp3'));
      await player.resume();
    } catch (_) {}
  }

  @override
  void dispose() {
    _timer?.cancel();
    _player?.stop();
    _player?.dispose();
    super.dispose();
  }

  String _formatTimer(int sec) {
    final m = (sec ~/ 60).toString().padLeft(1, '0');
    final s = (sec % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  String _statusText() {
    switch (widget.outgoing.status) {
      case OutgoingCallStatus.calling:
        return 'Calling…';
      case OutgoingCallStatus.ringing:
        return 'Ringing…';
      case OutgoingCallStatus.accepted:
        return 'Connecting…';
      case OutgoingCallStatus.declined:
        return 'Call Declined';
      case OutgoingCallStatus.timeout:
        return 'No Answer';
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDeclined = widget.outgoing.status == OutgoingCallStatus.declined;

    return Material(
      color: Colors.transparent,
      child: Stack(
        children: [
          // Ambient Gradient Background
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF381272),
                    Color(0xFF28105B),
                    Color(0xFF17134A),
                    Color(0xFF0F172A),
                  ],
                  stops: [0.0, 0.35, 0.7, 1.0],
                ),
              ),
            ),
          ),
          // Ambient Radial Violet Glow
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, -0.2),
                  radius: 0.85,
                  colors: [
                    const Color(0xFF7C3AED).withValues(alpha: 0.32),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 20),
                // Top Timer
                Text(
                  _formatTimer(_seconds),
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                // Contact Name
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    widget.outgoing.contactName,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                const Spacer(flex: 2),

                // Center Smiling Face & Ambient Glow (matching reference design)
                const _CallSmileyAvatar(),

                const SizedBox(height: 36),

                // Status Pill Chip
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  decoration: BoxDecoration(
                    color: isDeclined
                        ? const Color(0xFFEF4444).withValues(alpha: 0.3)
                        : Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isDeclined
                          ? const Color(0xFFEF4444).withValues(alpha: 0.5)
                          : Colors.white.withValues(alpha: 0.25),
                      width: 1,
                    ),
                  ),
                  child: Text(
                    _statusText(),
                    style: TextStyle(
                      color: isDeclined ? const Color(0xFFFCA5A5) : Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                // Dynamic Audio Waveform Visualizer
                const _SoundWaveformVisualizer(),

                const Spacer(flex: 3),

                // Bottom Action Controls Bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 36),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      // Speaker Toggle
                      _CallActionButton(
                        icon: _speakerOn ? Icons.volume_up_rounded : Icons.volume_down_rounded,
                        label: 'Speaker',
                        isActive: _speakerOn,
                        onTap: () {
                          HapticFeedback.lightImpact();
                          setState(() => _speakerOn = !_speakerOn);
                        },
                      ),

                      // End / Cancel Call (Large Red Button)
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onTap: () {
                              _player?.stop();
                              HapticFeedback.heavyImpact();
                              ref.read(callControllerProvider.notifier).cancelOutgoing();
                            },
                            child: Container(
                              width: 72,
                              height: 72,
                              decoration: BoxDecoration(
                                color: const Color(0xFFEF4444),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFFEF4444).withValues(alpha: 0.45),
                                    blurRadius: 22,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.call_end_rounded,
                                color: Colors.white,
                                size: 36,
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          const Text(
                            'End',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),

                      // Mute Toggle
                      _CallActionButton(
                        icon: _isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                        label: 'Mute',
                        isActive: _isMuted,
                        onTap: () {
                          HapticFeedback.lightImpact();
                          setState(() => _isMuted = !_isMuted);
                        },
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 48),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Fullscreen Incoming Ringing Screen matching reference design:
/// ambient gradient, caller headline, friendly avatar, pulsating waveform,
/// periodic haptics, same web ringtone loop, and Accept / Decline circular action buttons.
class IncomingCallOverlay extends ConsumerStatefulWidget {
  const IncomingCallOverlay({super.key, required this.call});
  final IncomingCall call;

  @override
  ConsumerState<IncomingCallOverlay> createState() => _IncomingCallOverlayState();
}

class _IncomingCallOverlayState extends ConsumerState<IncomingCallOverlay> {
  Timer? _hapticTimer;
  AudioPlayer? _player;

  @override
  void initState() {
    super.initState();
    _startRingtone();
    HapticFeedback.heavyImpact();
    _hapticTimer = Timer.periodic(const Duration(milliseconds: 1200), (_) {
      if (mounted) {
        HapticFeedback.heavyImpact();
      }
    });
  }

  void _startRingtone() async {
    try {
      final player = AudioPlayer();
      _player = player;
      await player.setReleaseMode(ReleaseMode.loop);
      await player.setSource(AssetSource('audio/ringtone.mp3'));
      await player.resume();
    } catch (_) {}
  }

  @override
  void dispose() {
    _hapticTimer?.cancel();
    _player?.stop();
    _player?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Stack(
        children: [
          // Ambient Gradient Background
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xFF381272),
                    Color(0xFF28105B),
                    Color(0xFF17134A),
                    Color(0xFF0F172A),
                  ],
                  stops: [0.0, 0.35, 0.7, 1.0],
                ),
              ),
            ),
          ),
          // Ambient Radial Glow
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(0, -0.2),
                  radius: 0.85,
                  colors: [
                    const Color(0xFF7C3AED).withValues(alpha: 0.32),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 24),
                // Top Tag
                const Text(
                  'Incoming Call',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 12),
                // Caller Name
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    widget.call.callerName,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                const Spacer(flex: 2),

                // Center Smiling Face & Glow
                const _CallSmileyAvatar(),

                const SizedBox(height: 36),

                // Conversation Pill Chip
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.25),
                      width: 1,
                    ),
                  ),
                  child: Text(
                    widget.call.conversationName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.2,
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                // Dynamic Audio Waveform Visualizer
                const _SoundWaveformVisualizer(),

                const Spacer(flex: 3),

                // Bottom Action Buttons: Decline (Red) and Accept (Green)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 48),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      // Decline Button
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onTap: () {
                              _player?.stop();
                              _hapticTimer?.cancel();
                              HapticFeedback.heavyImpact();
                              ref.read(callControllerProvider.notifier).decline();
                            },
                            child: Container(
                              width: 72,
                              height: 72,
                              decoration: BoxDecoration(
                                color: const Color(0xFFEF4444),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFFEF4444).withValues(alpha: 0.45),
                                    blurRadius: 22,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.call_end_rounded,
                                color: Colors.white,
                                size: 34,
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          const Text(
                            'Decline',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),

                      // Accept Button
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onTap: () {
                              _player?.stop();
                              _hapticTimer?.cancel();
                              HapticFeedback.heavyImpact();
                              ref.read(callControllerProvider.notifier).accept();
                            },
                            child: Container(
                              width: 72,
                              height: 72,
                              decoration: BoxDecoration(
                                color: const Color(0xFF10B981),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: const Color(0xFF10B981).withValues(alpha: 0.45),
                                    blurRadius: 22,
                                    spreadRadius: 2,
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.call_rounded,
                                color: Colors.white,
                                size: 34,
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          const Text(
                            'Accept',
                            style: TextStyle(
                              color: Colors.white70,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 48),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Circular Glass Action Button for Speaker / Mute
class _CallActionButton extends StatelessWidget {
  const _CallActionButton({
    required this.icon,
    required this.label,
    required this.isActive,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              color: isActive ? Colors.white : Colors.white.withValues(alpha: 0.18),
              shape: BoxShape.circle,
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.25),
                width: 1,
              ),
            ),
            child: Icon(
              icon,
              color: isActive ? const Color(0xFF1E1045) : Colors.white,
              size: 26,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }
}

/// Iconic Stylized Smiley Face from Reference Design
class _CallSmileyAvatar extends StatefulWidget {
  const _CallSmileyAvatar();

  @override
  State<_CallSmileyAvatar> createState() => _CallSmileyAvatarState();
}

class _CallSmileyAvatarState extends State<_CallSmileyAvatar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulseController;
  late final Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);

    _scaleAnimation = Tween<double>(begin: 0.96, end: 1.05).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scaleAnimation,
      child: Container(
        width: 120,
        height: 120,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: 0.08),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF9333EA).withValues(alpha: 0.35),
              blurRadius: 36,
              spreadRadius: 8,
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Eyes
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 22,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(width: 14),
                Container(
                  width: 7,
                  height: 22,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Smile Arc
            CustomPaint(
              size: const Size(54, 20),
              painter: _SmileArcPainter(),
            ),
          ],
        ),
      ),
    );
  }
}

class _SmileArcPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6.5
      ..strokeCap = StrokeCap.round;

    final rect = Rect.fromCenter(
      center: Offset(size.width / 2, 0),
      width: size.width,
      height: size.height * 2,
    );
    canvas.drawArc(rect, 0.25, math.pi - 0.5, false, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Rhythmic Audio Waveform Bars that oscillate dynamically
class _SoundWaveformVisualizer extends StatefulWidget {
  const _SoundWaveformVisualizer();

  @override
  State<_SoundWaveformVisualizer> createState() => _SoundWaveformVisualizerState();
}

class _SoundWaveformVisualizerState extends State<_SoundWaveformVisualizer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (context, _) {
        final t = _anim.value * 2 * math.pi;
        const barCount = 13;
        return Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(barCount, (i) {
            final offset = i * (math.pi / 4);
            final wave = (math.sin(t + offset) + 1) / 2;
            final height = 4.0 + (wave * 12.0);
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 2),
              width: 3.5,
              height: height,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(3),
              ),
            );
          }),
        );
      },
    );
  }
}
