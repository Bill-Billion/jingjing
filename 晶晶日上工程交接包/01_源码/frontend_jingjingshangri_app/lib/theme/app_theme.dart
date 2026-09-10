import 'package:flutter/material.dart';

/// 晶晶日上 V15「曜石流光 / Liquid Glass 2.0」主题 —— 唯一视觉 SSOT（档案21）。
/// 曜石蓝黑四层底 #070A12 / #0E1320 / #151B2C / #1C2438；
/// 香槟金（配给制）#F2DCA8 / #E6C586 / #C9A45E，CTA 135° 渐变 #F4E3B4→#D9B873；
/// 冷青点缀 #7FD4E0 / #3FA9C0（总面积 ≤5%）；文字 #F2F5FC / #AAB4C8 / #6E7891。
/// 禁止页面硬编码 hex、禁止旧鎏金/粉橙/旧紫/赛博高饱和回退。
/// 兼容说明：brandPink/brandOrange/purple/cyan/lightGold/gold 等旧字段名全部保留，
/// 取值统一映射到曜石流光体系，全站既有引用无需改名即可获得新视觉。
class AppTheme {
  // ── 曜石底色：冷调蓝黑四层（档案21 §三.1，替代旧 #0A0B10/#14161F/#232634）──
  static const Color background = Color(0xFF070A12); // bg/base 页面最底层
  static const Color surfaceDark = Color(0xFF0E1320); // bg/elev1 卡片叠色底/常规区块
  static const Color card = Color(0xFF151B2C); // bg/elev2 浮层/Sheet/输入框底
  static const Color cardLight = Color(0xFF1C2438); // bg/elev3 弹层/按压/最高悬浮
  static const Color border = Color(0xFF263049); // 冷调蓝灰描边

  /// 环境冷微光（仅顶部/品牌区极淡一团，面积小、不可发蓝发飘）
  static const Color ambientCool = Color(0xFF12324C);

  // ── 香槟金（配给制：主 CTA / 选中 / 关键数据 / 品牌，档案21 §三.2）──
  static const Color goldMain = Color(0xFFE6C586); // 主品牌色/线性选中/1px 描边
  static const Color goldLight = Color(0xFFF2DCA8); // 高光/选中文字/图标亮部
  static const Color goldDeep = Color(0xFFC9A45E); // 渐变暗端/按压
  static const Color brandPink = goldMain; // 兼容旧名 = 主金
  static const Color brandOrange = goldDeep; // 兼容旧名 = 暗端金

  /// CTA 专属香槟金渐变（135°，仅主 CTA / 中央创作键 / 关键数据）
  static const LinearGradient ctaGradient = LinearGradient(
    begin: Alignment(-0.7, -0.7), // 135°
    end: Alignment(0.7, 0.7),
    colors: [Color(0xFFF4E3B4), Color(0xFFD9B873)],
  );

  /// 品牌装饰渐变（高光→主金→暗金，用于徽章/分隔条等非 CTA 的克制金色）
  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [goldLight, goldMain, goldDeep],
  );

  /// 横向暖金渐变（标签/小指示条）
  static const LinearGradient brandGradientHorizontal = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [goldLight, goldMain, goldDeep],
  );

  /// 斜向品牌渐变
  static const LinearGradient brandGradientDiagonal = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [goldLight, goldMain, goldDeep],
  );

  // ── 兼容旧代码别名 ──
  static const Color gold = goldMain;
  static const Color lightGold = Color(0xFFF2DCA8);
  static const Color goldAccent = Color(0xFFE6C586);
  static const Color brandStart = goldLight;
  static const Color brandEnd = goldDeep;

  // ── 冷青点缀（B 方向记忆点，总面积 ≤5%，档案21 §三.3）──
  static const Color cyanSoft = Color(0xFF7FD4E0); // AI/进度/玻璃轮廓光/少量次级高光
  static const Color cyanDeep = Color(0xFF3FA9C0); // 冷青暗端/链接
  static const Color cyan = cyanSoft; // 旧青字段 → 真冷青（克制使用）

  // ── 旧紫字段：映射为曜石蓝灰（不再有任何紫调）──
  static const Color purple = Color(0xFF232C44);

  static const Color green = Color(0xFF4CAF7D); // 成功/在线（低饱和）

  /// 辅助色列表（香槟金层次 + 一点冷青，不再多彩霓虹）
  static const List<Color> accentColors = [
    goldMain,
    goldLight,
    goldDeep,
    cyanSoft,
    green,
  ];

  // ── 文字（冷调近白，档案21 §三.4）──
  static const Color textPrimary = Color(0xFFF2F5FC);
  static const Color textSecondary = Color(0xFFB4C9D6); // 冷青灰（抵消强青背景的互补发粉）
  static const Color textHint = Color(0xFF8298AD); // 冷青灰提示（青玻璃上清晰不发粉）

  // ── 语义状态色（全站唯一来源，禁止页面内再写 hex）──
  static const Color error = Color(0xFFE5604D); // 主错误/暖红
  static const Color errorStrong = Color(0xFFB05A4E); // 错误实心加深
  static const Color errorLight = Color(0xFFE08A7E); // 浅暖红：错误文案/图标
  static const Color errorSoft = Color(0xFFE8B4AC); // 更浅：错误长文
  static Color get errorSurface => error.withValues(alpha: 0.12);
  static const Color success = green;
  static const Color successLight = Color(0xFF7FB98E);
  static const Color successDeep = Color(0xFF2F5E44);
  static const Color warning = Color(0xFFE08A3C); // 返修/警示暖橙（低饱和）
  static const Color info = cyanSoft;

  // ── 第三方支付品牌色（仅支付方式图标，不进入主视觉；登录第三方按钮不用彩色）──
  static const Color wechatGreen = Color(0xFF07C160);
  static const Color alipayBlue = Color(0xFF1677FF);

  // ── 曜石环境微光（四层底之间的冷调过渡）──
  static const Color bgGlowTop = Color(0xFF101A2E); // 首页顶部冷微光
  static const Color bgGlowPanel = Color(0xFF0F1729); // 启动/面板微光
  static const Color bgGlowCard = Color(0xFF18223A); // 卡片/封面兜底微光

  // ── V15.1「曜石流光」液态体系（2026-09-01 用户拍板：冷青升为环境光主基调）──
  static const Color liquidBase = Color(0xFF05080F); // 流动背景最深处
  static const Color liquidDeep = Color(0xFF0A1626); // 流体暗部
  static const Color liquidTeal = Color(0xFF0E2E44); // 青蓝环境光团
  static const Color aquaDeep = Color(0xFF1E6E86); // 流体亮带暗端
  static const Color aquaBright = Color(0xFF36C6DE); // 流体亮带亮端
  static const Color iceHighlight = Color(0xFFC9F2F7); // 冰青顶部高光
  static const Color rimCyan = Color(0xFF5FD8E6); // 玻璃青色 rim light
  static const Color irisViolet = Color(0xFF93A2EC); // 虹彩内极淡蓝紫（仅中央气泡小面积）

  /// 虹彩 Sweep（青→金→淡蓝紫→青），仅中央气泡/极小聚焦元素
  static const SweepGradient irisSweep = SweepGradient(
    center: Alignment.center,
    colors: [
      Color(0xFF7FD4E0),
      Color(0xFFE6C586),
      Color(0xFF93A2EC),
      Color(0xFF5FD8E6),
      Color(0xFF7FD4E0),
    ],
    stops: [0.0, 0.32, 0.62, 0.85, 1.0],
  );

  /// 玻璃纵向体积填充（顶偏亮→中段泛冷青→底偏暗，做出玻璃厚度与通透）
  static const LinearGradient glassVolume = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0x36FFFFFF), Color(0x167FD4E0), Color(0x0AFFFFFF)],
    stops: [0.0, 0.5, 1.0],
  );

  /// V15.2「亮青液态玻璃」体积填充：靶图同款更通透、更青亮的玻璃
  /// （用于登录输入胶囊、圆钮、选中前芯片等需要明显青玻璃质感处）
  static const LinearGradient glassVolumeBright = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0x46C9F6FB), Color(0x3046CCE4), Color(0x12178CA8)],
    stops: [0.0, 0.52, 1.0],
  );

  /// 位图材质资源（V15.2 位图材质＋代码混合还原，质感锚定已认可靶图）
  static const String assetBgSilk =
      'assets/images/tex_bg_silk.png'; // 青蓝丝绸旋臂流光全屏背景
  static const String assetBrandMark =
      'assets/images/brand_logo_mark.png'; // 青玻璃金八芒星品牌标

  /// 玻璃 rim light（左上青亮 → 右下带金）
  static const LinearGradient glassRim = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0x995FD8E6), Color(0x337FD4E0), Color(0x40E6C586)],
  );

  /// 青蓝环境外发光（玻璃悬浮感）+ 深色投影
  static List<BoxShadow> get cyanHalo => const [
        BoxShadow(
            color: Color(0x332BB8D4),
            blurRadius: 22,
            spreadRadius: 0,
            offset: Offset(0, 6)),
        BoxShadow(color: Color(0x59000000), blurRadius: 24, offset: Offset(0, 10)),
      ];

  /// 金底按钮上的深色文字（档案21：#1A1408 保证对比）
  static const Color onGold = Color(0xFF1A1408);

  /// 标题衬线字体（仅品牌名/影视标题点缀），找不到字体时回退系统衬线
  static const String serifFont = 'serif';

  /// 全局正文无衬线字体族：真机走 Roboto + 系统中文回退；离屏/测试统一命中注入字体
  static const String sansFont = 'Roboto';

  // ── Liquid Glass 材质（档案21 §三.5，克制使用）──
  static Color glassWhite = Colors.white.withValues(alpha: 0.08); // 玻璃填充 8%
  static Color glassWhiteStrong = Colors.white.withValues(alpha: 0.10); // 10%
  static Color glassBorder = Colors.white.withValues(alpha: 0.10); // 玻璃细边
  static Color glassHighlight = Colors.white.withValues(alpha: 0.18); // 顶部 1px 内高光

  /// 固定层真实毛玻璃模糊区间（仅顶/底栏与浮层，列表卡不用实时模糊）
  static const double glassSigmaLow = 18;
  static const double glassSigmaHigh = 24;

  // ── 阴影 = Z 轴（深色投影，禁止又重又糊，档案21 §三.6）──
  /// elev1 卡：0 8 24 黑 45%
  static List<BoxShadow> get elev1Shadow => const [
        BoxShadow(
          color: Color(0x73000000), // rgba(0,0,0,.45)
          blurRadius: 24,
          offset: Offset(0, 8),
        ),
      ];

  /// elev2 浮层：0 16 48 黑 55%
  static List<BoxShadow> get elev2Shadow => const [
        BoxShadow(
          color: Color(0x8C000000), // rgba(0,0,0,.55)
          blurRadius: 48,
          offset: Offset(0, 16),
        ),
      ];

  /// CTA 克制辉光：rgba(217,184,115,.25) 0 6 20（禁止过曝）
  static List<BoxShadow> get ctaGlow => const [
        BoxShadow(
          color: Color(0x40D9B873), // rgba(217,184,115,.25)
          blurRadius: 20,
          offset: Offset(0, 6),
        ),
      ];

  /// 兼容旧名：品牌暖金阴影 = 克制 CTA 辉光
  static List<BoxShadow> get brandShadow => ctaGlow;

  static List<BoxShadow> get brandShadowSmall => const [
        BoxShadow(
          color: Color(0x2ED9B873), // rgba(217,184,115,.18)
          blurRadius: 12,
          offset: Offset(0, 4),
        ),
      ];

  // 旧名保留（原粉/紫辉光）→ 统一为克制金辉光，不再有彩色光晕
  static List<BoxShadow> get glowPink => ctaGlow;
  static List<BoxShadow> get glowPurple => ctaGlow;

  // ── 圆角（档案21 §三.5：卡/Bento 20、控件/输入 14、Sheet 顶 24、按钮胶囊）──
  static const BorderRadius pillRadius = BorderRadius.all(Radius.circular(999));
  static const BorderRadius cardRadius = BorderRadius.all(Radius.circular(20));
  static const BorderRadius cardRadiusMedium = BorderRadius.all(Radius.circular(20));
  static const BorderRadius controlRadius = BorderRadius.all(Radius.circular(14));
  static const double radiusCard = 20;
  static const double radiusControl = 14;
  static const double radiusSheet = 24;

  /// 统一线性图标描边视觉参数（1.8 描边/圆角端点/24px 视觉框）
  static const double iconStroke = 1.8;
  static const double iconBox = 24;

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      fontFamily: sansFont,
      // V15.2：页面 Scaffold 默认透明，曜石流光由 MainScaffold / 命名路由壳统一承载
      // （栈底 Splash/Login/MainScaffold 均为不透明兜底，不会黑屏）
      scaffoldBackgroundColor: Colors.transparent,
      colorScheme: const ColorScheme.dark(
        primary: goldMain,
        secondary: goldDeep,
        surface: card,
        error: error,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 18,
          fontWeight: FontWeight.w700,
          fontFamily: sansFont,
        ),
        iconTheme: IconThemeData(color: textPrimary),
      ),
      // V15.5 全局转场兜底：即使个别页面误用 MaterialPageRoute，也保持与
      // Motion.fadeSlideRoute 一致的淡入+轻位移，全平台统一，时长对齐 Motion.page。
      pageTransitionsTheme: const PageTransitionsTheme(builders: {
        TargetPlatform.android: ObsidianPageTransitionsBuilder(),
        TargetPlatform.iOS: ObsidianPageTransitionsBuilder(),
        TargetPlatform.windows: ObsidianPageTransitionsBuilder(),
        TargetPlatform.macOS: ObsidianPageTransitionsBuilder(),
        TargetPlatform.linux: ObsidianPageTransitionsBuilder(),
      }),
      // V15.5 全局弹窗统一曜石底色与圆角，未逐页设置 backgroundColor 的
      // bottomSheet / dialog 也不会出现平台默认白底，18 处弹窗一并兜底。
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: surfaceDark,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: surfaceDark,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        clipBehavior: Clip.antiAlias,
      ),
      dialogTheme: const DialogThemeData(
        backgroundColor: surfaceDark,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(20))),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: surfaceDark,
        selectedItemColor: goldMain,
        unselectedItemColor: textHint,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: card,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: cardRadiusMedium,
          side: const BorderSide(color: border),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: goldMain,
          foregroundColor: onGold,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 14),
          shape: const StadiumBorder(),
          textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: onGold,
              fontFamily: sansFont),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: goldLight,
          side: const BorderSide(color: Color(0x8CE6C586), width: 1.2),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: const StadiumBorder(),
          textStyle: const TextStyle(
              fontSize: 15, fontWeight: FontWeight.w700, fontFamily: sansFont),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: goldLight,
          textStyle: const TextStyle(
              fontWeight: FontWeight.w700, fontFamily: sansFont),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        // elev2 玻璃底
        fillColor: Colors.white.withValues(alpha: 0.06),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusControl),
          borderSide: BorderSide(color: glassBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusControl),
          borderSide: BorderSide(color: glassBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(radiusControl),
          borderSide: const BorderSide(color: goldMain, width: 1.5),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        hintStyle:
            const TextStyle(color: textHint, fontSize: 14, fontFamily: sansFont),
      ),
      // V15.6（A1 收口）：全局 SnackBar 曜石化——全站 60+ 处 SnackBar 不再走
      // Material 默认深灰，统一曜石深色底 + 克制金描边 + 浮起圆角，一处接管零逐页改。
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: surfaceDark,
        elevation: 12,
        contentTextStyle: const TextStyle(
            color: textPrimary, fontSize: 13.5, height: 1.4, fontFamily: sansFont),
        actionTextColor: goldLight,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(14)),
          side: BorderSide(color: goldMain.withValues(alpha: 0.18)),
        ),
      ),
      // 进度指示器兜底金色（个别未显式上色处也统一为克制金，不再用 Material 主色蓝）
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: goldMain,
        linearTrackColor: Color(0x1FFFFFFF),
      ),
      // TabBar 兜底曜石金（与各页已显式设置的 label/indicator 同色，未显式处不再用默认）
      tabBarTheme: const TabBarThemeData(
        labelColor: goldMain,
        unselectedLabelColor: textSecondary,
        indicatorColor: goldMain,
        labelStyle: TextStyle(
            fontSize: 13.5, fontWeight: FontWeight.w800, fontFamily: sansFont),
        unselectedLabelStyle: TextStyle(
            fontSize: 13.5, fontWeight: FontWeight.w500, fontFamily: sansFont),
      ),
      // 分隔线兜底极淡白，不再用 Material 默认高对比灰线
      dividerTheme: const DividerThemeData(
        color: Color(0x14FFFFFF),
        thickness: 1,
        space: 1,
      ),
      // 开关兜底曜石金（与设置页 _goldSwitch 同色，未显式处也一致）
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith<Color?>((states) =>
            states.contains(WidgetState.selected) ? goldMain : textHint),
        trackColor: WidgetStateProperty.resolveWith<Color?>((states) =>
            states.contains(WidgetState.selected)
                ? goldMain.withValues(alpha: 0.35)
                : Colors.white.withValues(alpha: 0.08)),
        trackOutlineColor:
            const WidgetStatePropertyAll<Color>(Colors.transparent),
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
            color: textPrimary,
            fontSize: 32,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5),
        headlineMedium:
            TextStyle(color: textPrimary, fontSize: 24, fontWeight: FontWeight.w700),
        titleLarge:
            TextStyle(color: textPrimary, fontSize: 20, fontWeight: FontWeight.w700),
        titleMedium:
            TextStyle(color: textPrimary, fontSize: 16, fontWeight: FontWeight.w700),
        bodyLarge:
            TextStyle(color: textPrimary, fontSize: 15, fontWeight: FontWeight.w500),
        bodyMedium: TextStyle(color: textPrimary, fontSize: 14),
        bodySmall: TextStyle(color: textSecondary, fontSize: 12),
        labelLarge:
            TextStyle(color: goldMain, fontSize: 14, fontWeight: FontWeight.w700),
      ),
      dividerColor: border,
      chipTheme: ChipThemeData(
        backgroundColor: Colors.white.withValues(alpha: 0.06),
        selectedColor: goldMain,
        labelStyle: const TextStyle(
            color: textSecondary,
            fontSize: 12,
            fontWeight: FontWeight.w600,
            fontFamily: sansFont),
        secondaryLabelStyle: const TextStyle(
            color: onGold,
            fontSize: 12,
            fontWeight: FontWeight.w700,
            fontFamily: sansFont),
        side: BorderSide(color: glassBorder),
        shape: const StadiumBorder(),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      ),
    );
  }

  /// 毛玻璃容器装饰（曜石流光：半透填充 + 冷调细边；顶部内高光由 GlassCard 负责）
  static BoxDecoration glassDecoration({
    double radius = 20,
    Color? color,
    bool border = true,
  }) {
    return BoxDecoration(
      color: color ?? glassWhite,
      borderRadius: BorderRadius.circular(radius),
      border: border ? Border.all(color: glassBorder, width: 1) : null,
    );
  }

  /// 品牌渐变文字（香槟金；仅品牌名/影视标题等品牌场景）
  static Widget gradientText(
    String text, {
    double fontSize = 32,
    FontWeight fontWeight = FontWeight.w800,
    double letterSpacing = 0,
  }) {
    return ShaderMask(
      shaderCallback: (bounds) => const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xFFF4E3B4), goldMain, goldDeep],
      ).createShader(bounds),
      child: Text(
        text,
        style: TextStyle(
          color: Colors.white,
          fontSize: fontSize,
          fontWeight: fontWeight,
          letterSpacing: letterSpacing,
          fontFamily: serifFont,
        ),
      ),
    );
  }
}

/// 曜石流光统一页面转场（全局兜底）：淡入 + 右侧 6% 轻位移，
/// 与 Motion.fadeSlideRoute 观感一致；尊重系统“减少动态效果”。
class ObsidianPageTransitionsBuilder extends PageTransitionsBuilder {
  const ObsidianPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    final curved = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position:
            Tween(begin: const Offset(0.06, 0), end: Offset.zero).animate(curved),
        child: child,
      ),
    );
  }
}
