// 毛玻璃（glassmorphism）通用组件：模糊背景 + 半透明 + 圆角 + 细边高光
import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme.dart';

/// 毛玻璃容器：用于地图覆盖层、底部导航等悬浮元素
/// 背景内容越丰富（如地图），磨砂效果越明显
class GlassBox extends StatelessWidget {
  final Widget child;
  final double borderRadius;
  final double blur; // 模糊强度
  final EdgeInsetsGeometry padding;
  final Color? tint; // 半透明底色（覆盖黑/白）
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;

  const GlassBox({
    super.key,
    required this.child,
    this.borderRadius = 12,
    this.blur = 14,
    this.padding = const EdgeInsets.all(8),
    this.tint,
    this.margin,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    // 默认半透明底色：暗色下深、明色下浅，保证可读性
    final Color fill = tint ??
        (dark ? Colors.black.withValues(alpha: 0.45) : Colors.white.withValues(alpha: 0.55));
    final Color edge = dark ? Colors.white.withValues(alpha: 0.12) : Colors.white.withValues(alpha: 0.6);

    final panel = ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            color: fill,
            // 顶部高光 + 底部暗边，营造立体层次
            border: Border.all(color: edge, width: 0.8),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: dark ? 0.45 : 0.12),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );

    if (onTap == null) return panel;
    return GestureDetector(onTap: onTap, child: panel);
  }
}

/// MC 像素小方块装饰（低调点缀，用于空状态/角落）
class McPixelCube extends StatelessWidget {
  final double size;
  const McPixelCube({super.key, this.size = 14});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size * 0.35,
          decoration: const BoxDecoration(
            color: Color(0xFF63C74D),
            borderRadius: BorderRadius.vertical(top: Radius.circular(1)),
          ),
        ),
        Container(
          width: size,
          height: size * 0.5,
          decoration: const BoxDecoration(
            color: Color(0xFF8B6B4D),
            borderRadius: BorderRadius.vertical(bottom: Radius.circular(1)),
          ),
        ),
      ],
    );
  }
}