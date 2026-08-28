// MC 官网配色（明暗两套）× Material 3 现代圆角 × MC 像素游戏风
import 'package:flutter/material.dart';

class McColors {
  // 明色
  static const lightBg = Color(0xFFF6F7F4);
  static const lightCard = Color(0xFFFFFFFF);
  static const lightText = Color(0xFF1A1A1A);
  static const lightMuted = Color(0xFF6E6E6A);
  static const lightBorder = Color(0xFFE2E3DD);
  static const lightGreen = Color(0xFF2D6B22); // MC 深绿
  static const lightGreenBright = Color(0xFF4AA32C);
  static const lightDanger = Color(0xFFC62828);

  // 暗色
  static const darkBg = Color(0xFF141412);
  static const darkCard = Color(0xFF1E1D1B);
  static const darkText = Color(0xFFF2F1EE);
  static const darkMuted = Color(0xFF9C9A93);
  static const darkBorder = Color(0xFF33312D);
  static const darkGreen = Color(0xFF3B8526); // MC 官网绿
  static const darkGreenBright = Color(0xFF5ED043);
  static const darkDanger = Color(0xFFFF6B5E);

  // 金色点缀（官网按钮 hover 黄绿）
  static const gold = Color(0xFFE8C84B);
}

ThemeData buildMcTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final Color bg = dark ? McColors.darkBg : McColors.lightBg;
  final Color card = dark ? McColors.darkCard : McColors.lightCard;
  final Color text = dark ? McColors.darkText : McColors.lightText;
  final Color muted = dark ? McColors.darkMuted : McColors.lightMuted;
  final Color border = dark ? McColors.darkBorder : McColors.lightBorder;
  final Color green = dark ? McColors.darkGreen : McColors.lightGreen;
  final Color greenBright = dark ? McColors.darkGreenBright : McColors.lightGreenBright;

  final scheme = ColorScheme(
    brightness: b,
    primary: green,
    onPrimary: Colors.white,
    secondary: greenBright,
    onSecondary: Colors.white,
    error: dark ? McColors.darkDanger : McColors.lightDanger,
    onError: Colors.white,
    surface: card,
    onSurface: text,
    surfaceContainerHighest: dark ? const Color(0xFF2A2925) : const Color(0xFFEEEFEA),
    outline: border,
    outlineVariant: border,
  );

  final base = ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: bg,
    useMaterial3: true,
  );

  // Material 3 大圆角 + MC 方块元素（按钮像素感：小圆角 + 深描边 + 按下下沉）
  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: text,
      displayColor: text,
    ),
    dividerColor: border,
    cardColor: card,
    cardTheme: CardThemeData(
      color: card,
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: border.withValues(alpha: 0.6)),
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: card,
      foregroundColor: text,
      elevation: 0,
      centerTitle: false,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: TextStyle(
        color: text,
        fontSize: 18,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.3,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: card,
      indicatorColor: green,
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final sel = states.contains(WidgetState.selected);
        return IconThemeData(
          color: sel ? Colors.white : muted,
          size: 24,
        );
      }),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final sel = states.contains(WidgetState.selected);
        return TextStyle(
          fontSize: 11,
          fontWeight: sel ? FontWeight.w800 : FontWeight.w500,
          color: sel ? green : muted,
        );
      }),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: green,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: dark ? const Color(0xFF7A5C12) : const Color(0xFF234D1A), width: 2),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.5),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: green,
        minimumSize: const Size(0, 44),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: BorderSide(color: green, width: 1.6),
        ),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: dark ? McColors.darkText : const Color(0xFF2B2B28),
      contentTextStyle: TextStyle(color: dark ? McColors.darkBg : Colors.white, fontSize: 13),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF181715) : const Color(0xFFF0F1EC),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: green, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
    ),
    listTileTheme: ListTileThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
  );
}

// MC 像素风标题样式（粗体 + 微斜方块前缀，模拟游戏标题感）
TextStyle mcPixelTitleStyle(Color color) => TextStyle(
      color: color,
      fontSize: 18,
      fontWeight: FontWeight.w900,
      letterSpacing: 1.2,
      height: 1.2,
      shadows: const [
        Shadow(offset: Offset(1.5, 1.5), color: Color(0x33000000)),
      ],
    );