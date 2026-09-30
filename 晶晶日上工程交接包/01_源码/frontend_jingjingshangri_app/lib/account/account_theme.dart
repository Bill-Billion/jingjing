import 'package:flutter/material.dart';

/// Shared warm-white presentation from the approved App gallery.
class AccountTheme extends StatelessWidget {
  const AccountTheme({super.key, required this.child});
  final Widget child;
  static const canvas = Color(0xFFF7F5F0);
  static const surface = Colors.white;
  static const text = Color(0xFF252923);
  static const muted = Color(0xFF6A706A);
  static const accent = Color(0xFFB45D3D);
  static const border = Color(0xFFE2E3DB);
  static const danger = Color(0xFFB83A37);
  static ThemeData get data => ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
                seedColor: accent, brightness: Brightness.light)
            .copyWith(
                primary: accent,
                surface: surface,
                onSurface: text,
                error: danger),
        scaffoldBackgroundColor: canvas,
        fontFamily: 'PingFang SC',
        fontFamilyFallback: const ['Microsoft YaHei', 'sans-serif'],
        textTheme: const TextTheme(
          headlineSmall: TextStyle(
              fontSize: 24, fontWeight: FontWeight.w700, height: 1.35),
          titleLarge: TextStyle(
              fontSize: 24, fontWeight: FontWeight.w700, height: 1.35),
          titleMedium:
              TextStyle(fontSize: 18, fontWeight: FontWeight.w700, height: 1.4),
          bodyLarge: TextStyle(fontSize: 16, height: 1.6),
          bodyMedium: TextStyle(fontSize: 14, height: 1.5),
          bodySmall: TextStyle(fontSize: 12, height: 1.5),
          labelLarge: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          labelMedium: TextStyle(fontSize: 14),
          labelSmall: TextStyle(fontSize: 12),
        ).apply(bodyColor: text, displayColor: text),
        appBarTheme: const AppBarTheme(
            backgroundColor: canvas,
            foregroundColor: text,
            elevation: 0,
            scrolledUnderElevation: 0,
            toolbarHeight: 53,
            titleSpacing: 16,
            titleTextStyle: TextStyle(
                color: text, fontSize: 18, fontWeight: FontWeight.w700),
            centerTitle: true),
        cardTheme: CardThemeData(
            color: surface,
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: const BorderSide(color: Color(0x00FFFFFF)))),
        dialogTheme: DialogThemeData(
            backgroundColor: surface,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12))),
        inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: surface,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: border)),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: const BorderSide(color: border))),
        filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
                minimumSize: const Size(44, 48),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)))),
        outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
                minimumSize: const Size(44, 44),
                side: const BorderSide(color: accent),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)))),
        dividerTheme: const DividerThemeData(color: border),
        navigationBarTheme: NavigationBarThemeData(
          indicatorColor: Colors.transparent,
          iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
              size: 26,
              color: states.contains(WidgetState.selected) ? accent : muted)),
          labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(
              fontSize: 12,
              color: states.contains(WidgetState.selected) ? accent : muted)),
        ),
      );
  @override
  Widget build(BuildContext context) => Theme(data: data, child: child);
}
