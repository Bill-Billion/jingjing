import 'package:flutter/material.dart';
import '../widgets/editorial_icons.dart';

/// 第 1 期「可灵风暗色变体」PoC —— 独立文件，不接入任何路由，零改动风险。
///
/// 参考：Kling AI v3.3（可灵，2026-04）。视觉语法：
///   纯黑底 + 荧光绿强调 + 18–20px 大圆角媒体卡 + 胶囊按钮 + 顶部环境辉光。
///
/// 与 [AccountTheme] 同 API：把目标页中的 `AccountTheme.xxx` 替换为
/// `AccountThemeDark.xxx`，并用 `AccountThemeDark(child: ...)` 包裹即可试点。
///
/// 令牌差异（对照 AccountTheme）：
///   canvas      #F3F1E8 暖纸  →  #000000 纯黑
///   surface     #F3F1E8      →  #121212 深灰卡片
///   text        #151515      →  #FFFFFF
///   muted       #66645F      →  #9A9A9A
///   accent      #A73124 砖红  →  #C6FF00 荧光绿
///   border      #CECBC2      →  #262626
///   标题字体    NotoSerifSC  →  NotoSansSC
///   圆角        0            →  20（卡片）/ 999（按钮）
///
/// 注意：#C6FF00 是可灵的强品牌资产。若担心品牌同质化，可只保留结构
/// （黑底/大圆角/胶囊/媒体卡），把 accent 换成曜石冷青 #7FD4E0 或香槟金 #E6C586。
class AccountThemeDark extends StatelessWidget {
  const AccountThemeDark({super.key, required this.child, this.plaza = false});

  final Widget child;
  final bool plaza;

  // ── 底色 ──
  static const canvas = Color(0xFF000000);
  static const surface = Color(0xFF121212);
  static const surfaceHigh = Color(0xFF1A1A1A);
  static const text = Color(0xFFFFFFFF);
  static const muted = Color(0xFF9A9A9A);

  // ── 强调色 ──
  static const accent = Color(0xFFC6FF00); // 荧光绿 CTA / 选中 / 数据
  static const accentInk = Color(0xFF061000); // 绿底上的黑字
  static const vermilion = accent;

  static const border = Color(0xFF262626);
  static const divider = Color(0xFF1F1F1F);
  static const danger = Color(0xFFFF5A4E);

  // ── 字体：全站无衬线 ──
  static const serif = 'NotoSansSC';
  static const sans = 'NotoSansSC';
  static const sansFallback = [
    'NotoSansSC',
    'PingFang SC',
    'Microsoft YaHei',
    'sans-serif'
  ];

  static const _cardRadius = BorderRadius.all(Radius.circular(20));
  static const _controlRadius = BorderRadius.all(Radius.circular(14));
  static const _cardShape =
      RoundedRectangleBorder(borderRadius: _cardRadius);
  static const _controlShape =
      RoundedRectangleBorder(borderRadius: _controlRadius);
  static const _pill = StadiumBorder();

  static ThemeData get data => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: const ColorScheme.dark(
            primary: accent,
            onPrimary: accentInk,
            secondary: accent,
            onSecondary: accentInk,
            surface: surface,
            onSurface: text,
            outline: border,
            error: danger),
        scaffoldBackgroundColor: canvas,
        canvasColor: canvas,
        fontFamily: sans,
        fontFamilyFallback: const [
          'NotoSansSC',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif'
        ],
        textTheme: const TextTheme(
          headlineLarge: TextStyle(
              fontFamily: sans,
              fontSize: 32,
              fontWeight: FontWeight.w900,
              height: 1.15,
              letterSpacing: -0.6,
              color: text),
          headlineMedium: TextStyle(
              fontFamily: sans,
              fontSize: 26,
              fontWeight: FontWeight.w900,
              height: 1.2,
              letterSpacing: -0.4,
              color: text),
          headlineSmall: TextStyle(
              fontFamily: sans,
              fontSize: 22,
              fontWeight: FontWeight.w900,
              height: 1.25,
              letterSpacing: -0.3,
              color: text),
          titleLarge: TextStyle(
              fontFamily: sans,
              fontSize: 19,
              fontWeight: FontWeight.w800,
              height: 1.3,
              color: text),
          titleMedium:
              TextStyle(fontSize: 15, fontWeight: FontWeight.w600, height: 1.45),
          bodyLarge: TextStyle(fontSize: 14, height: 1.7),
          bodyMedium: TextStyle(fontSize: 12.5, height: 1.65),
          bodySmall: TextStyle(fontSize: 11, height: 1.5),
          labelLarge: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          labelMedium: TextStyle(fontSize: 11),
          labelSmall: TextStyle(fontSize: 10),
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
                fontWeight: FontWeight.w700),
            centerTitle: false),
        cardTheme: const CardThemeData(
            color: surface,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            margin: EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(
                borderRadius: _cardRadius, side: BorderSide(color: border))),
        dialogTheme: const DialogThemeData(
            backgroundColor: surfaceHigh,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(24)))),
        datePickerTheme: const DatePickerThemeData(
            backgroundColor: surfaceHigh,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(24))),
            headerHeadlineStyle: TextStyle(
                fontFamily: sans, fontSize: 24, fontWeight: FontWeight.w900),
            todayForegroundColor: WidgetStatePropertyAll(accent)),
        timePickerTheme: const TimePickerThemeData(
            backgroundColor: surfaceHigh,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.all(Radius.circular(24))),
            hourMinuteShape: _controlShape,
            hourMinuteTextStyle: TextStyle(
                fontFamily: sans, fontSize: 36, fontWeight: FontWeight.w700)),
        bottomSheetTheme: const BottomSheetThemeData(
            backgroundColor: surfaceHigh,
            surfaceTintColor: Colors.transparent,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)))),
        inputDecorationTheme: const InputDecorationTheme(
            filled: true,
            fillColor: surface,
            contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(
                borderRadius: _controlRadius,
                borderSide: BorderSide(color: border)),
            enabledBorder: OutlineInputBorder(
                borderRadius: _controlRadius,
                borderSide: BorderSide(color: border)),
            focusedBorder: OutlineInputBorder(
                borderRadius: _controlRadius,
                borderSide: BorderSide(color: accent, width: 1.4)),
            errorBorder: OutlineInputBorder(
                borderRadius: _controlRadius,
                borderSide: BorderSide(color: danger)),
            hintStyle: TextStyle(color: muted, fontSize: 13)),
        filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: accentInk,
                minimumSize: const Size(44, 46),
                shape: _pill,
                textStyle:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
                elevation: 0)),
        elevatedButtonTheme: ElevatedButtonThemeData(
            style: ElevatedButton.styleFrom(
                backgroundColor: surfaceHigh,
                foregroundColor: text,
                minimumSize: const Size(44, 46),
                shape: _pill,
                elevation: 0)),
        outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
                foregroundColor: text,
                minimumSize: const Size(44, 46),
                side: const BorderSide(color: border),
                shape: _pill)),
        textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(
                foregroundColor: accent,
                minimumSize: const Size(44, 44),
                shape: _pill)),
        chipTheme: const ChipThemeData(
            backgroundColor: surface,
            selectedColor: accent,
            secondarySelectedColor: accent,
            labelStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: text,
                fontSize: 11),
            secondaryLabelStyle: TextStyle(
                fontFamily: sans,
                fontFamilyFallback: sansFallback,
                color: accentInk,
                fontSize: 11),
            shape: _pill,
            side: BorderSide(color: border),
            showCheckmark: false),
        segmentedButtonTheme: SegmentedButtonThemeData(
            style: ButtonStyle(
                shape: const WidgetStatePropertyAll(_pill),
                backgroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? accent : surface),
                foregroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected)
                        ? accentInk
                        : text))),
        dividerTheme: const DividerThemeData(color: divider, thickness: 1),
        progressIndicatorTheme: const ProgressIndicatorThemeData(
            color: accent, linearTrackColor: border),
        iconTheme: const IconThemeData(color: text, size: 21),
        navigationBarTheme: NavigationBarThemeData(
            backgroundColor: canvas,
            indicatorColor: Colors.transparent,
            iconTheme: WidgetStateProperty.resolveWith((states) =>
                IconThemeData(
                    size: 22,
                    color: states.contains(WidgetState.selected)
                        ? accent
                        : muted)),
            labelTextStyle: WidgetStateProperty.resolveWith((states) =>
                TextStyle(
                    fontFamily: sans,
                    fontFamilyFallback: sansFallback,
                    fontSize: 10,
                    color: states.contains(WidgetState.selected)
                        ? accent
                        : muted,
                    fontWeight: states.contains(WidgetState.selected)
                        ? FontWeight.w600
                        : FontWeight.w400))),
      );

  /// 广场频道：与 data 同底，标题再放大一档（对应 AccountTheme.plazaData）。
  static ThemeData get plazaData {
    final base = data;
    return base.copyWith(
        visualDensity: VisualDensity.standard,
        actionIconTheme: ActionIconThemeData(
            backButtonIconBuilder: (_) =>
                const Icon(EditorialIcons.arrowLeft, size: 22)),
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
