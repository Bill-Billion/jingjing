import 'package:flutter/material.dart';

/// Paper, ink and vermilion from the supplied film editorial prototype.
class AccountTheme extends StatelessWidget {
  const AccountTheme({super.key, required this.child});
  final Widget child;
  static const canvas = Color(0xFFF3F1E8);
  static const surface = Color(0xFFF3F1E8);
  static const text = Color(0xFF151515);
  static const muted = Color(0xFF66645F);
  static const accent = Color(0xFFA73124);
  static const vermilion = Color(0xFFEF4938);
  static const border = Color(0xFFCECBC2);
  static const danger = Color(0xFFB62F25);
  static const serif = 'EditorialSerif';
  static const sans = 'NotoSansSC';
  static const sansFallback = [
    'NotoSansSC',
    'PingFang SC',
    'Microsoft YaHei',
    'sans-serif'
  ];
  static const _square = RoundedRectangleBorder();
  static ThemeData get data => ThemeData(
        useMaterial3: true,
        colorScheme: const ColorScheme.light(
            primary: text,
            onPrimary: canvas,
            secondary: accent,
            onSecondary: Colors.white,
            surface: surface,
            onSurface: text,
            outline: border,
            error: danger),
        scaffoldBackgroundColor: canvas,
        fontFamily: sans,
        fontFamilyFallback: const [
          'NotoSansSC',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif'
        ],
        textTheme: const TextTheme(
          headlineLarge: TextStyle(
              fontFamily: serif,
              fontSize: 42,
              fontWeight: FontWeight.w900,
              height: 1.2),
          headlineMedium: TextStyle(
              fontFamily: serif,
              fontSize: 34,
              fontWeight: FontWeight.w900,
              height: 1.25),
          headlineSmall: TextStyle(
              fontFamily: serif,
              fontSize: 28,
              fontWeight: FontWeight.w900,
              height: 1.3),
          titleLarge: TextStyle(
              fontFamily: serif,
              fontSize: 24,
              fontWeight: FontWeight.w700,
              height: 1.35),
          titleMedium:
              TextStyle(fontSize: 17, fontWeight: FontWeight.w600, height: 1.4),
          bodyLarge: TextStyle(fontSize: 16, height: 1.6),
          bodyMedium: TextStyle(fontSize: 14, height: 1.6),
          bodySmall: TextStyle(fontSize: 12, height: 1.5),
          labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          labelMedium: TextStyle(fontSize: 12),
          labelSmall: TextStyle(fontSize: 11),
        ).apply(bodyColor: text, displayColor: text, fontFamilyFallback: const [
          'NotoSansSC',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif'
        ]),
        appBarTheme: const AppBarTheme(
            backgroundColor: canvas,
            foregroundColor: text,
            elevation: 0,
            scrolledUnderElevation: 0,
            surfaceTintColor: Colors.transparent,
            toolbarHeight: 56,
            titleSpacing: 0,
            titleTextStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: text,
                fontSize: 14,
                fontWeight: FontWeight.w500),
            centerTitle: false),
        cardTheme: const CardThemeData(
            color: canvas,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            margin: EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(side: BorderSide(color: border))),
        dialogTheme: const DialogThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: _square),
        datePickerTheme: const DatePickerThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: _square,
            headerHeadlineStyle: TextStyle(
                fontFamily: serif, fontSize: 32, fontWeight: FontWeight.w900),
            todayForegroundColor: WidgetStatePropertyAll(vermilion)),
        timePickerTheme: const TimePickerThemeData(
            backgroundColor: canvas,
            shape: _square,
            hourMinuteShape: _square,
            hourMinuteTextStyle: TextStyle(
                fontFamily: sans, fontSize: 40, fontWeight: FontWeight.w600)),
        bottomSheetTheme: const BottomSheetThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: _square),
        inputDecorationTheme: const InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            border: UnderlineInputBorder(
                borderRadius: BorderRadius.zero,
                borderSide: BorderSide(color: border)),
            enabledBorder: UnderlineInputBorder(
                borderRadius: BorderRadius.zero,
                borderSide: BorderSide(color: border)),
            focusedBorder: UnderlineInputBorder(
                borderRadius: BorderRadius.zero,
                borderSide: BorderSide(color: text, width: 1.5)),
            errorBorder: UnderlineInputBorder(
                borderRadius: BorderRadius.zero,
                borderSide: BorderSide(color: danger))),
        filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
                backgroundColor: text,
                foregroundColor: canvas,
                minimumSize: const Size(44, 48),
                shape: _square,
                elevation: 0)),
        elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
                backgroundColor: text,
                foregroundColor: canvas,
                minimumSize: const Size(44, 48),
                shape: _square,
                elevation: 0)),
        outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
                foregroundColor: text,
                minimumSize: const Size(44, 48),
                side: const BorderSide(color: text),
                shape: _square)),
        textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(
                foregroundColor: text,
                minimumSize: const Size(44, 44),
                shape: _square)),
        chipTheme: const ChipThemeData(
            backgroundColor: canvas,
            selectedColor: text,
            secondarySelectedColor: text,
            labelStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: text,
                fontSize: 13),
            secondaryLabelStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: canvas,
                fontSize: 13),
            shape: _square,
            side: BorderSide(color: border),
            showCheckmark: false),
        segmentedButtonTheme: SegmentedButtonThemeData(
            style: ButtonStyle(
                shape: const WidgetStatePropertyAll(_square),
                backgroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? text : canvas),
                foregroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? canvas : text))),
        dividerTheme: const DividerThemeData(color: border, thickness: 1),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
            color: accent, linearTrackColor: border),
        navigationBarTheme: NavigationBarThemeData(
            indicatorColor: Colors.transparent,
            iconTheme: const WidgetStatePropertyAll(
                IconThemeData(size: 22, color: text)),
            labelTextStyle: WidgetStateProperty.resolveWith((states) =>
                TextStyle(
                    fontFamily: sans,
                    fontFamilyFallback: sansFallback,
                    fontSize: 11,
                    color: text,
                    fontWeight: states.contains(WidgetState.selected)
                        ? FontWeight.w600
                        : FontWeight.w400))),
      );
  @override
  Widget build(BuildContext context) => Theme(data: data, child: child);
}
