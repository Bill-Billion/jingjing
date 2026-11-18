import 'package:flutter/material.dart';
import '../widgets/editorial_icons.dart';

/// V5 晶晶光场: green-black surfaces, lime actions and sans-serif type.
/// Implementation tokens follow the current V5 canvas visually; they are not
/// an exported Figma variable library. Keep business status colours semantic.
class AccountTheme extends StatelessWidget {
  const AccountTheme({super.key, required this.child, this.plaza = false});
  final Widget child;
  final bool plaza;
  static const canvas = Color(0xFF101713);
  static const surface = Color(0xFF1C2820);
  static const selectedSurface = Color(0xFF2D4025);
  static const onAccent = Color(0xFF14200E);
  static const text = Color(0xFFF2F6EF);
  static const muted = Color(0xFFA6B2A8);
  static const accent = Color(0xFFC7F36B);
  static const vermilion = Color(0xFFC7F36B);
  static const border = Color(0xFF344238);
  static const danger = Color(0xFFFF8E85);
  static const serif = 'NotoSansSC';
  static const sans = 'NotoSansSC';
  static const sansFallback = [
    'NotoSansSC',
    'PingFang SC',
    'Microsoft YaHei',
    'sans-serif'
  ];
  static const _shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.all(Radius.circular(16)));
  static ThemeData get data => ThemeData(
        useMaterial3: true,
        colorScheme: const ColorScheme.dark(
            primary: accent,
            onPrimary: onAccent,
            secondary: accent,
            onSecondary: onAccent,
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
            color: surface,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            margin: EdgeInsets.only(bottom: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(20)),
                side: BorderSide(color: border))),
        dialogTheme: const DialogThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: _shape),
        datePickerTheme: const DatePickerThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: _shape,
            headerHeadlineStyle: TextStyle(
                fontFamily: serif, fontSize: 32, fontWeight: FontWeight.w900),
            todayForegroundColor: WidgetStatePropertyAll(vermilion)),
        timePickerTheme: const TimePickerThemeData(
            backgroundColor: canvas,
            shape: _shape,
            hourMinuteShape: _shape,
            hourMinuteTextStyle: TextStyle(
                fontFamily: sans, fontSize: 40, fontWeight: FontWeight.w600)),
        bottomSheetTheme: const BottomSheetThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: _shape),
        inputDecorationTheme: const InputDecorationTheme(
            filled: true,
            fillColor: surface,
            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(14)),
                borderSide: BorderSide(color: border)),
            enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(14)),
                borderSide: BorderSide(color: border)),
            focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(14)),
                borderSide: BorderSide(color: text, width: 1.5)),
            errorBorder: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(14)),
                borderSide: BorderSide(color: danger))),
        filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: onAccent,
                minimumSize: const Size(44, 48),
                shape: _shape,
                elevation: 0)),
        elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: onAccent,
                minimumSize: const Size(44, 48),
                shape: _shape,
                elevation: 0)),
        outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
                foregroundColor: text,
                minimumSize: const Size(44, 48),
                side: const BorderSide(color: text),
                shape: _shape)),
        textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(
                foregroundColor: text,
                minimumSize: const Size(44, 44),
                shape: _shape)),
        chipTheme: const ChipThemeData(
            backgroundColor: canvas,
            selectedColor: selectedSurface,
            secondarySelectedColor: selectedSurface,
            labelStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: text,
                fontSize: 13),
            secondaryLabelStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: accent,
                fontSize: 13),
            shape: _shape,
            side: BorderSide(color: border),
            showCheckmark: false),
        segmentedButtonTheme: SegmentedButtonThemeData(
            style: ButtonStyle(
                shape: const WidgetStatePropertyAll(_shape),
                backgroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? selectedSurface : surface),
                foregroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? accent : text))),
        dividerTheme: const DividerThemeData(color: border, thickness: 1),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
            color: accent, linearTrackColor: border),
        navigationBarTheme: NavigationBarThemeData(
            indicatorColor: Colors.transparent,
            backgroundColor: canvas,
            iconTheme: WidgetStateProperty.resolveWith((states) =>
                IconThemeData(size: 22, color: states.contains(WidgetState.selected) ? accent : muted)),
            labelTextStyle: WidgetStateProperty.resolveWith((states) =>
                TextStyle(
                    fontFamily: sans,
                    fontFamilyFallback: sansFallback,
                    fontSize: 11,
                    color: states.contains(WidgetState.selected) ? accent : muted,
                    fontWeight: states.contains(WidgetState.selected)
                        ? FontWeight.w600
                        : FontWeight.w400))),
      );
  static ThemeData get plazaData {
    final base = data;
    const fieldBorder = OutlineInputBorder(
        borderRadius: BorderRadius.all(Radius.circular(14)), borderSide: BorderSide(color: border));
    return base.copyWith(
        visualDensity: VisualDensity.standard,
        actionIconTheme: ActionIconThemeData(
            backButtonIconBuilder: (_) =>
                const Icon(EditorialIcons.arrowLeft, size: 22)),
        colorScheme:
            base.colorScheme.copyWith(primary: accent, onPrimary: onAccent),
        appBarTheme: base.appBarTheme.copyWith(
            titleTextStyle: const TextStyle(
                fontFamily: serif,
                fontFamilyFallback: sansFallback,
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: text)),
        textTheme: base.textTheme.copyWith(
            titleMedium: const TextStyle(
                fontFamily: sans,
                fontSize: 14,
                fontWeight: FontWeight.w400,
                height: 1.5,
                color: text),
            bodyLarge: const TextStyle(
                fontFamily: sans, fontSize: 14, height: 1.6, color: text)),
        inputDecorationTheme: base.inputDecorationTheme.copyWith(
            fillColor: canvas,
            filled: true,
            border: fieldBorder,
            enabledBorder: fieldBorder,
            focusedBorder: const OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(14)),
                borderSide: BorderSide(color: text, width: 1.5)),
            errorBorder: const OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(14)),
                borderSide: BorderSide(color: danger)),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 14)),
        filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
                // Lime actions use dark labels, never white-on-lime.
                backgroundColor: accent,
                foregroundColor: onAccent,
                minimumSize: const Size(44, 44),
                shape: _shape,
                textStyle:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                elevation: 0)),
        outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
                foregroundColor: text,
                minimumSize: const Size(44, 44),
                side: const BorderSide(color: border),
                textStyle:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                shape: _shape)),
        dialogTheme: base.dialogTheme.copyWith(
            titleTextStyle: const TextStyle(
                fontFamily: serif,
                fontSize: 24,
                fontWeight: FontWeight.w900,
                color: text),
            contentTextStyle: const TextStyle(
                fontFamily: sans, fontSize: 14, height: 1.6, color: text)));
  }

  @override
  Widget build(BuildContext context) =>
      Theme(data: plaza ? plazaData : data, child: child);
}
