import 'package:flutter/material.dart';
import '../widgets/editorial_icons.dart';

/// 第 1 期「白底变体」PoC —— 独立文件，不接入任何路由，零改动风险。
///
/// 与 [AccountTheme] 保持同一套 API：把目标页面中的 `AccountTheme.xxx`
/// 替换为 `AccountThemeWhite.xxx`，并用 `AccountThemeWhite(child: ...)`
/// 包裹，即可单独试点，不影响其余页面。
///
/// 令牌差异（对照 AccountTheme）：
///   canvas      #F3F1E8 暖纸  →  #FFFFFF 纯白
///   text        #151515      →  #111111
///   muted       #66645F      →  #6B6B6B
///   accent      #A73124 砖红  →  #D71920 安全红（小字号可用）
///   vermilion   #EF4938      →  #E60012 正红（仅色块/指示条）
///   border      #CECBC2      →  #E9E9E9
///   标题字体    NotoSerifSC  →  NotoSansSC（无衬线）
///   圆角        0            →  4
class AccountThemeWhite extends StatelessWidget {
  const AccountThemeWhite({super.key, required this.child, this.plaza = false});

  final Widget child;
  final bool plaza;

  // ── 底色与墨色 ──
  static const canvas = Color(0xFFFFFFFF);
  static const surface = Color(0xFFFFFFFF);
  static const text = Color(0xFF111111);
  static const muted = Color(0xFF6B6B6B);

  // ── 强调色：正红分两档，避免小字直接压 #E60012 ──
  static const accent = Color(0xFFD71920); // 正文可用红 / 链接 / 标签
  static const vermilion = Color(0xFFE60012); // CTA / 指示条 / 色块

  static const border = Color(0xFFE9E9E9);
  static const danger = Color(0xFFB31217);

  // ── 字体：标题不再使用衬线 ──
  static const serif = 'NotoSansSC';
  static const sans = 'NotoSansSC';
  static const sansFallback = [
    'NotoSansSC',
    'PingFang SC',
    'Microsoft YaHei',
    'sans-serif'
  ];

  static const _radius = BorderRadius.all(Radius.circular(4));
  static const _shape = RoundedRectangleBorder(borderRadius: _radius);

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
          // 参考虎嗅 v9.12：无衬线、字重拉开层级、字号整体下调一档。
          headlineLarge: TextStyle(
              fontFamily: sans,
              fontSize: 28,
              fontWeight: FontWeight.w900,
              height: 1.25,
              letterSpacing: -0.4),
          headlineMedium: TextStyle(
              fontFamily: sans,
              fontSize: 24,
              fontWeight: FontWeight.w900,
              height: 1.28,
              letterSpacing: -0.3),
          headlineSmall: TextStyle(
              fontFamily: sans,
              fontSize: 21,
              fontWeight: FontWeight.w900,
              height: 1.3,
              letterSpacing: -0.2),
          titleLarge: TextStyle(
              fontFamily: sans,
              fontSize: 19,
              fontWeight: FontWeight.w800,
              height: 1.35),
          titleMedium:
              TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.45),
          bodyLarge: TextStyle(fontSize: 15, height: 1.65),
          bodyMedium: TextStyle(fontSize: 13, height: 1.65),
          bodySmall: TextStyle(fontSize: 12, height: 1.5),
          labelLarge: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
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
            toolbarHeight: 52,
            titleSpacing: 0,
            titleTextStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: text,
                fontSize: 15,
                fontWeight: FontWeight.w600),
            centerTitle: false),
        cardTheme: const CardThemeData(
            color: canvas,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            margin: EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(
                borderRadius: _radius, side: BorderSide(color: border))),
        dialogTheme: const DialogThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: _shape),
        datePickerTheme: const DatePickerThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: _shape,
            headerHeadlineStyle: TextStyle(
                fontFamily: sans, fontSize: 24, fontWeight: FontWeight.w900),
            todayForegroundColor: WidgetStatePropertyAll(vermilion)),
        timePickerTheme: const TimePickerThemeData(
            backgroundColor: canvas,
            shape: _shape,
            hourMinuteShape: _shape,
            hourMinuteTextStyle: TextStyle(
                fontFamily: sans, fontSize: 36, fontWeight: FontWeight.w700)),
        bottomSheetTheme: const BottomSheetThemeData(
            backgroundColor: canvas,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.vertical(top: Radius.circular(12)))),
        inputDecorationTheme: const InputDecorationTheme(
            filled: true,
            fillColor: Colors.white,
            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            border: OutlineInputBorder(
                borderRadius: _radius, borderSide: BorderSide(color: border)),
            enabledBorder: OutlineInputBorder(
                borderRadius: _radius, borderSide: BorderSide(color: border)),
            focusedBorder: OutlineInputBorder(
                borderRadius: _radius,
                borderSide: BorderSide(color: text, width: 1.4)),
            errorBorder: OutlineInputBorder(
                borderRadius: _radius, borderSide: BorderSide(color: danger))),
        filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
                backgroundColor: vermilion,
                foregroundColor: Colors.white,
                minimumSize: const Size(44, 44),
                shape: _shape,
                elevation: 0)),
        elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
                backgroundColor: text,
                foregroundColor: canvas,
                minimumSize: const Size(44, 44),
                shape: _shape,
                elevation: 0)),
        outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
                foregroundColor: text,
                minimumSize: const Size(44, 44),
                side: const BorderSide(color: border),
                shape: _shape)),
        textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(
                foregroundColor: accent,
                minimumSize: const Size(44, 44),
                shape: _shape)),
        chipTheme: const ChipThemeData(
            backgroundColor: canvas,
            selectedColor: text,
            secondarySelectedColor: text,
            labelStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: text,
                fontSize: 12),
            secondaryLabelStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: canvas,
                fontSize: 12),
            shape: _shape,
            side: BorderSide(color: border),
            showCheckmark: false),
        segmentedButtonTheme: SegmentedButtonThemeData(
            style: ButtonStyle(
                shape: const WidgetStatePropertyAll(_shape),
                backgroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? text : canvas),
                foregroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? canvas : text))),
        dividerTheme: const DividerThemeData(color: border, thickness: 1),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
            color: vermilion, linearTrackColor: border),
        navigationBarTheme: NavigationBarThemeData(
            indicatorColor: Colors.transparent,
            iconTheme: const WidgetStatePropertyAll(
                IconThemeData(size: 21, color: text)),
            labelTextStyle: WidgetStateProperty.resolveWith((states) =>
                TextStyle(
                    fontFamily: sans,
                    fontFamilyFallback: sansFallback,
                    fontSize: 10,
                    color: states.contains(WidgetState.selected)
                        ? vermilion
                        : muted,
                    fontWeight: states.contains(WidgetState.selected)
                        ? FontWeight.w600
                        : FontWeight.w400))),
      );

  /// 广场频道：与 data 同底，仅将主色切到正红（保留与 AccountTheme.plazaData 的对应关系）。
  static ThemeData get plazaData {
    final base = data;
    return base.copyWith(
        visualDensity: VisualDensity.standard,
        actionIconTheme: ActionIconThemeData(
            backButtonIconBuilder: (_) =>
                const Icon(EditorialIcons.arrowLeft, size: 22)),
        colorScheme:
            base.colorScheme.copyWith(primary: vermilion, onPrimary: Colors.white),
        appBarTheme: base.appBarTheme.copyWith(
            titleTextStyle: const TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                fontSize: 21,
                fontWeight: FontWeight.w900,
                color: text)));
  }

  @override
  Widget build(BuildContext context) =>
      Theme(data: plaza ? plazaData : data, child: child);
}
