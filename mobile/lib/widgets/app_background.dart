import 'package:flutter/material.dart';

class AppBackground extends StatelessWidget {
  const AppBackground({
    super.key,
    required this.child,
    this.overlayColor,
  });

  final Widget child;
  final Color? overlayColor;

  static const String assetPath = 'assets/images/app_background.png';

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.asset(
          assetPath,
          fit: BoxFit.cover,
          alignment: Alignment.center,
          errorBuilder: (_, _, _) => const ColoredBox(
            color: Color(0xFFF8FAFC),
          ),
        ),
        if (overlayColor != null)
          Positioned.fill(
            child: ColoredBox(color: overlayColor!),
          ),
        child,
      ],
    );
  }
}
