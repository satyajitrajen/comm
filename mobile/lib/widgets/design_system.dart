import 'package:flutter/material.dart';

enum TtButtonVariant { primary, secondary, filled, destructive }

class TtButton extends StatelessWidget {
  const TtButton({
    super.key,
    required this.text,
    this.onPressed,
    this.icon,
    this.variant = TtButtonVariant.primary,
    this.busy = false,
    this.height = 54,
  });

  const TtButton.primary({
    super.key,
    required this.text,
    this.onPressed,
    this.icon,
    this.busy = false,
    this.height = 54,
  }) : variant = TtButtonVariant.primary;

  const TtButton.secondary({
    super.key,
    required this.text,
    this.onPressed,
    this.icon,
    this.busy = false,
    this.height = 54,
  }) : variant = TtButtonVariant.secondary;

  const TtButton.filled({
    super.key,
    required this.text,
    this.onPressed,
    this.icon,
    this.busy = false,
    this.height = 54,
  }) : variant = TtButtonVariant.filled;

  const TtButton.destructive({
    super.key,
    required this.text,
    this.onPressed,
    this.icon,
    this.busy = false,
    this.height = 54,
  }) : variant = TtButtonVariant.destructive;

  final String text;
  final VoidCallback? onPressed;
  final IconData? icon;
  final TtButtonVariant variant;
  final bool busy;
  final double height;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !busy;

    Color background;
    Color foreground;
    BorderSide border = BorderSide.none;
    List<BoxShadow>? shadows;

    switch (variant) {
      case TtButtonVariant.primary:
        background = Colors.white;
        foreground = const Color(0xFF0F172A);
        shadows = const [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 14,
            offset: Offset(0, 4),
          ),
        ];
        break;
      case TtButtonVariant.secondary:
        background = const Color(0x2EFFFFFF);
        foreground = Colors.white;
        border = const BorderSide(color: Color(0x4DFFFFFF), width: 1.2);
        shadows = const [
          BoxShadow(
            color: Color(0x0F000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ];
        break;
      case TtButtonVariant.filled:
        background = const Color(0xFF0284C7);
        foreground = Colors.white;
        shadows = const [
          BoxShadow(
            color: Color(0x290284C7),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ];
        break;
      case TtButtonVariant.destructive:
        background = const Color(0xFFE11D48);
        foreground = Colors.white;
        shadows = const [
          BoxShadow(
            color: Color(0x29E11D48),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ];
        break;
    }

    return AnimatedOpacity(
      opacity: enabled ? 1.0 : 0.6,
      duration: const Duration(milliseconds: 150),
      child: Container(
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(height / 2),
          boxShadow: enabled ? shadows : null,
        ),
        child: Material(
          color: background,
          shape: StadiumBorder(side: border),
          child: InkWell(
            onTap: enabled ? onPressed : null,
            customBorder: const StadiumBorder(),
            child: Center(
              child: busy
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.2,
                        valueColor: AlwaysStoppedAnimation<Color>(foreground),
                      ),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (icon != null) ...[
                          Icon(icon, size: 20, color: foreground),
                          const SizedBox(width: 8),
                        ],
                        Text(
                          text,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: foreground,
                            letterSpacing: -0.2,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class TtSquircleBadge extends StatelessWidget {
  const TtSquircleBadge({
    super.key,
    required this.child,
    this.size = 64,
    this.radius = 20,
    this.backgroundColor = Colors.white,
  });

  final Widget child;
  final double size;
  final double radius;
  final Color backgroundColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(radius),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1F000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Center(child: child),
    );
  }
}

class TtGlassCard extends StatelessWidget {
  const TtGlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.borderRadius = 20,
    this.backgroundColor = const Color(0xE6FFFFFF),
    this.borderColor = const Color(0x33FFFFFF),
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double borderRadius;
  final Color backgroundColor;
  final Color borderColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final border = BorderRadius.circular(borderRadius);
    return Container(
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: border,
        border: Border.all(color: borderColor, width: 1),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F000000),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: border,
        child: InkWell(
          borderRadius: border,
          onTap: onTap,
          child: Padding(
            padding: padding,
            child: child,
          ),
        ),
      ),
    );
  }
}
