import 'package:flutter/material.dart';

/// This palette is deliberately scoped to account and contract screens.
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
        textTheme: ThemeData.light()
            .textTheme
            .apply(bodyColor: text, displayColor: text),
        appBarTheme: const AppBarTheme(
            backgroundColor: canvas,
            foregroundColor: text,
            elevation: 0,
            scrolledUnderElevation: 0,
            centerTitle: false),
        cardTheme: CardThemeData(
            color: surface,
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: const BorderSide(color: border))),
        inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: surface,
            contentPadding: const EdgeInsets.all(16),
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
                side: const BorderSide(color: border),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)))),
        dividerTheme: const DividerThemeData(color: border),
      );
  @override
  Widget build(BuildContext context) => Theme(data: data, child: child);
}
