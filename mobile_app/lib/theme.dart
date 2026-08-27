// MC 官网（minecraft.net）配色 —— 明暗两套
// 暗色：深黑绿背景 + MC 绿；明色：白底 + 深绿
import 'package:flutter/material.dart';

class McColors {
  // 明色
  static const lightBg = Color(0xFFF7F7F5);
  static const lightCard = Color(0xFFFFFFFF);
  static const lightText = Color(0xFF1A1A1A);
  static const lightMuted = Color(0xFF6E6E6A);
  static const lightBorder = Color(0xFFE0E0DA);
  static const lightGreen = Color(0xFF2D6B22); // MC 深绿
  static const lightGreenBright = Color(0xFF4AA32C);
  static const lightDanger = Color(0xFFC62828);

  // 暗色
  static const darkBg = Color(0xFF171615);
  static const darkCard = Color(0xFF232220);
  static const darkText = Color(0xFFF5F4F2);
  static const darkMuted = Color(0xFFA6A49E);
  static const darkBorder = Color(0xFF34322F);
  static const darkGreen = Color(0xFF3B8526); // MC 官网绿
  static const darkGreenBright = Color(0xFF55C23A);
  static const darkDanger = Color(0xFFFF5252);

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
  );

  final base = ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: bg,
    fontFamily: null,
    useMaterial3: true,
  );

  return base.copyWith(
    textTheme: base.textTheme.apply(
      bodyColor: text,
      displayColor: text,
    ),
    dividerColor: border,
    cardColor: card,
    appBarTheme: AppBarTheme(
      backgroundColor: card,
      foregroundColor: text,
      elevation: 0,
      centerTitle: false,
      surfaceTintColor: Colors.transparent,
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      backgroundColor: card,
      selectedItemColor: green,
      unselectedItemColor: muted,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: dark ? McColors.darkText : const Color(0xFF2B2B28),
      contentTextStyle: TextStyle(color: dark ? McColors.darkBg : Colors.white),
      behavior: SnackBarBehavior.floating,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? const Color(0xFF1D1C1A) : const Color(0xFFF0F0EC),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: green, width: 1.6),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    ),
  );
}