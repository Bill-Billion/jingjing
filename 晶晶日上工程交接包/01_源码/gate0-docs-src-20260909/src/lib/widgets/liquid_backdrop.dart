import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import '../theme/app_theme.dart';

/// V15.2「曜石流光」整页环境背景（位图材质 + 代码流动层）。
/// - 底层：Seedream 导出的青蓝丝绸旋臂流光位图 [AppTheme.assetBgSilk]，
/// ///   负责靶图级真实丝缎体积、光尘与青蓝浓度（代码渐变无法达到的真实质感）；
/// - 上层：极淡的代码光带/微粒缓慢流动，为静态位图赋予呼吸与方向；
/// - 四角 vignette 与上下 scrim 保证前景文字/玻璃控件的可读性。
/// 缺位图时自动回退纯代码渲染（overlay=false 自绘实底），绝不白屏。
class LiquidBackdrop extends StatefulWidget {
  /// 关闭动画（测试 / 离屏出图固定相位）
  final bool animated;

  /// 固定相位（0..1），animated=false 时生效
  final double staticPhase;

  /// Gate0 隔离实验台 V8：30fps 量化重绘——相位按 1/30s 步进，
  /// 相位不变时 shouldRepaint=false，RepaintBoundary 保留旧栅格，
  /// 逐帧重绘次数减半（14s 慢漂移下视觉无损）。
  final bool halfRate;

  /// Gate0 隔离实验台 V9：光带/光团冻结相位，仅微粒闪烁——
  /// 消除逐帧全屏大 fill（模糊光带/大光团），保留画面生命感。
  final bool dotsOnly;

  /// V10：把位图+场景层离屏烘焙成单纹理，每帧只画 1 张全屏图 + 微粒。
  final bool bakeBase;

  const LiquidBackdrop({
    super.key,
    this.animated = true,
    this.staticPhase = 0.15,
    this.halfRate = false,
    this.dotsOnly = false,
    this.bakeBase = false,
  });

  @override
  State<LiquidBackdrop> createState() => _LiquidBackdropState();
}

class _LiquidBackdropState extends State<LiquidBackdrop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 14),
    );
    if (widget.animated) _c.repeat();
  }

  @override
  void dispose() {
    _c.dispose();
    _baked?.dispose();
    super.dispose();
  }

  // —— V10 bakeBase：离屏把「位图+光团+光带+scrim+vignette」烘成一张纹理，
  // 每帧只画 1 张全屏图 + 46 微粒，消除多全屏层的逐帧合成 fill。 ——
  ui.Image? _baked;
  Size? _bakedFor;
  bool _baking = false;

  Future<void> _bake(Size logical, double dpr) async {
    try {
      final ByteData data = await rootBundle.load(AppTheme.assetBgSilk);
      final ui.Codec codec =
          await ui.instantiateImageCodec(data.buffer.asUint8List());
      final ui.FrameInfo frame = await codec.getNextFrame();
      final ui.Image src = frame.image;
      final double pw = logical.width * dpr;
      final double ph = logical.height * dpr;
      final ui.PictureRecorder rec = ui.PictureRecorder();
      final Canvas canvas = Canvas(rec);
      canvas.scale(dpr, dpr);
      final Size sz = Size(logical.width, logical.height);
      // 位图 cover 铺满（与 Image.asset BoxFit.cover 对齐）
      final double scale = math.max(sz.width / src.width, sz.height / src.height);
      final double dw = src.width * scale, dh = src.height * scale;
      canvas.drawImageRect(
          src,
          Rect.fromLTWH(0, 0, src.width.toDouble(), src.height.toDouble()),
          Rect.fromLTWH(
              (sz.width - dw) / 2, (sz.height - dh) / 2, dw, dh),
          Paint()..filterQuality = FilterQuality.medium);
      src.dispose();
      // 场景层（光团/光带/scrim/vignette，冻结相位 0.15）
      LiquidBackdropPainter(phase: 0.15, overlay: true).paint(canvas, sz);
      final ui.Picture pic = rec.endRecording();
      final ui.Image baked = await pic.toImage(pw.round(), ph.round());
      pic.dispose();
      if (mounted) {
        setState(() {
          _baked?.dispose();
          _baked = baked;
          _bakedFor = logical;
        });
      } else {
        baked.dispose();
      }
    } catch (_) {
      // 烘焙失败：保持普通渲染路径，绝不白屏
    } finally {
      _baking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    // V10：单纹理烘焙路径
    if (widget.bakeBase) {
      final double dpr = MediaQuery.of(context).devicePixelRatio;
      return LayoutBuilder(builder: (context, cons) {
        final Size size = cons.biggest;
        if (_baked == null && !_baking && size.width > 0) {
          _baking = true;
          _bake(size, dpr);
        }
        final Widget flow;
        if (_baked != null && _bakedFor == size) {
          double phase = widget.staticPhase;
          if (widget.animated) {
            phase = _c.value;
            if (widget.halfRate) phase = (phase * 420).floorToDouble() / 420;
          }
          flow = AnimatedBuilder(
            animation: _c,
            builder: (_, __) => CustomPaint(
              painter: _BakedBackdropPainter(base: _baked!, phase: phase),
            ),
          );
        } else {
          // 烘焙完成前回退普通路径（与常态渲染一致）
          flow = RepaintBoundary(
            child: AnimatedBuilder(
              animation: _c,
              builder: (_, __) => CustomPaint(
                painter: LiquidBackdropPainter(phase: _c.value, overlay: true),
              ),
            ),
          );
        }
        if (_baked != null && _bakedFor == size) return flow;
        // 回退：位图 + 流动层（烘焙中）
        final Widget bitmap = Image.asset(
          AppTheme.assetBgSilk,
          fit: BoxFit.cover,
          alignment: const Alignment(0, -0.12),
          filterQuality: FilterQuality.medium,
          errorBuilder: (_, __, ___) => const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  AppTheme.liquidBase,
                  AppTheme.liquidTeal,
                  AppTheme.liquidDeep
                ],
              ),
            ),
          ),
        );
        return Stack(
          fit: StackFit.expand,
          children: [
            Positioned.fill(child: bitmap),
            Positioned.fill(child: flow),
          ],
        );
      });
    }

    // 底层位图（cover 铺满，缺图回退纯代码底色）
    final Widget bitmap = Image.asset(
      AppTheme.assetBgSilk,
      fit: BoxFit.cover,
          alignment: const Alignment(0, -0.12),
      filterQuality: FilterQuality.medium,
      errorBuilder: (_, __, ___) => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppTheme.liquidBase, AppTheme.liquidTeal, AppTheme.liquidDeep],
          ),
        ),
      ),
    );

    // 流动绘制层：静态固定相位 / 动画跟随控制器。
    // 性能：动画分支用 RepaintBoundary 隔离，且静态 bitmap 留在外层只构建一次，
    // 不再随每帧 AnimatedBuilder 重建位图子树。
    // V8 halfRate：相位量化到 30fps 步进（14s×30=420 步），相位不变的帧
    // shouldRepaint=false，跳过重录制与重光栅化。
    double phase = widget.staticPhase;
    if (widget.animated) {
      phase = _c.value;
      if (widget.halfRate) phase = (phase * 420).floorToDouble() / 420;
    }
    final Widget flow = !widget.animated
        ? CustomPaint(
            painter: LiquidBackdropPainter(
                phase: widget.staticPhase,
                overlay: true,
                dotsOnly: widget.dotsOnly),
          )
        : RepaintBoundary(
            child: AnimatedBuilder(
              animation: _c,
              builder: (_, __) => CustomPaint(
                painter: LiquidBackdropPainter(
                    phase: phase,
                    overlay: true,
                    dotsOnly: widget.dotsOnly),
              ),
            ),
          );

    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned.fill(child: bitmap),
        Positioned.fill(child: flow),
      ],
    );
  }
}

/// 静态可测的背景画笔。[overlay]=true 时位图已承担底色与主光，
/// 本画笔只叠加极淡流动层 + 可读性 scrim + vignette；
/// [overlay]=false 时（位图缺失兜底）自绘完整实底背景。
class LiquidBackdropPainter extends CustomPainter {
  final double phase; // 0..1
  final bool overlay;
  final bool dotsOnly;

  LiquidBackdropPainter({
    required this.phase,
    this.overlay = false,
    this.dotsOnly = false,
  });

  /// 固定种子的微粒静态参数（归一化坐标 + 半径），全局只生成一次。
  static final List<_BgDot> _dots = () {
    final rnd = math.Random(42);
    return List.generate(
        46,
        (_) => _BgDot(rnd.nextDouble(), rnd.nextDouble(),
            0.6 + rnd.nextDouble() * 1.6));
  }();

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    if (w <= 0 || h <= 0) return;

    // overlay 模式下代码层整体减淡，避免盖住位图丝缎
    final double k = overlay ? 0.42 : 1.0;

    // 1) 非 overlay：自绘竖向曜石实底；overlay：跳过（位图即底）
    if (!overlay) {
      final bg = Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppTheme.liquidBase,
            AppTheme.liquidTeal,
            AppTheme.liquidDeep,
          ],
          stops: [0.0, 0.52, 1.0],
        ).createShader(Offset.zero & size);
      canvas.drawRect(Offset.zero & size, bg);
    }

    // V9 dotsOnly：光带/光团冻结相位（消除逐帧全屏大 fill），微粒仍用真实相位
    final double t = phase * 2 * math.pi;
    final double tScene = dotsOnly ? 0.15 * 2 * math.pi : t;

    // 2) 顶部冷青环境光团（缓慢呼吸、微微漂移）
    final topGlowCenter = Offset(
      w * (0.5 + 0.06 * math.sin(tScene * 0.7)),
      h * 0.16,
    );
    final topGlow = Paint()
      ..shader = RadialGradient(
        colors: [
          AppTheme.aquaBright.withValues(alpha: (overlay ? 0.10 : 0.20)),
          AppTheme.aquaBright.withValues(alpha: 0),
        ],
      ).createShader(Rect.fromCircle(
        center: topGlowCenter,
        radius: w * 0.95,
      ))
      ..blendMode = BlendMode.screen;
    canvas.drawRect(Offset.zero & size, topGlow);

    // 3) 两团对角流动的青蓝光团（液态主体）
    final blob1Center = Offset(
      w * (0.30 + 0.18 * math.sin(tScene * 0.9)),
      h * (0.42 + 0.10 * math.cos(tScene * 0.6)),
    );
    _drawBlob(canvas, blob1Center, w * 0.72,
        [AppTheme.aquaDeep.withValues(alpha: 0.20 * k), const Color(0x000E1320)]);
    final blob2Center = Offset(
      w * (0.74 + 0.14 * math.cos(tScene * 0.5)),
      h * (0.72 + 0.10 * math.sin(tScene * 0.8)),
    );
    _drawBlob(canvas, blob2Center, w * 0.80,
        [AppTheme.irisViolet.withValues(alpha: 0.10 * k), const Color(0x00070B16)]);

    // 4) 一条对角斜向流体光带（丝绸感主线条）
    final ribbon = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * 0.10
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 28)
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          AppTheme.aquaBright.withValues(alpha: 0.0),
          AppTheme.rimCyan.withValues(alpha: 0.14 * k),
          AppTheme.irisViolet.withValues(alpha: 0.08 * k),
          const Color(0x0036C6DE),
        ],
        stops: const [0.0, 0.4, 0.7, 1.0],
      ).createShader(Offset.zero & size);
    final drift = 0.05 * math.sin(tScene);
    final path = Path()
      ..moveTo(w * (-0.1), h * (0.30 + drift))
      ..cubicTo(
        w * 0.30, h * (0.12 - drift),
        w * 0.55, h * (0.62 + drift),
        w * 1.10, h * (0.40 - drift),
      );
    canvas.drawPath(path, ribbon);

    // 5) 冷青洗色（统一青蓝基调；overlay 已由位图承担，跳过）
    if (!overlay) {
      final wash = Paint()
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.aquaBright.withValues(alpha: 0.05),
            Colors.transparent,
            AppTheme.irisViolet.withValues(alpha: 0.05),
          ],
        ).createShader(Offset.zero & size);
      canvas.drawRect(Offset.zero & size, wash);
    }

    // 6) 细微悬浮微粒（缓慢上浮、轻微闪烁）
    // 性能：微粒的水平比例/初始纵比/半径由固定种子 Random(42) 决定、每帧恒定，
    // 提为 static 只生成一次，避免每帧 new Random 并连算 46×3 次 nextDouble。
    paintDots(canvas, size, phase, t, overlay ? 0.7 : 1);

    // 7) overlay：上下轻微 scrim，压暗内容承载区，保证白字/玻璃对比
    if (overlay) {
      final scrim = Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.black.withValues(alpha: 0.22),
            Colors.transparent,
            Colors.transparent,
            Colors.black.withValues(alpha: 0.30),
          ],
          stops: const [0.0, 0.16, 0.78, 1.0],
        ).createShader(Offset.zero & size);
      canvas.drawRect(Offset.zero & size, scrim);
    }

    // 8) 四角 vignette，聚焦中央
    final vignette = Paint()
      ..shader = RadialGradient(
        center: const Alignment(0, -0.05),
        radius: 1.15,
        colors: [
          Colors.transparent,
          AppTheme.liquidDeep.withValues(alpha: overlay ? 0.30 : 0.55),
        ],
        stops: const [0.62, 1.0],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, vignette);
  }

  void _drawBlob(Canvas canvas, Offset c, double r, List<Color> colors) {
    final p = Paint()
      ..shader = RadialGradient(colors: colors)
          .createShader(Rect.fromCircle(center: c, radius: r))
      ..blendMode = BlendMode.screen;
    canvas.drawCircle(c, r, p);
  }

  /// 微粒绘制（V10 烘焙路径与普通路径共用）：46 颗固定种子微粒，
  /// [phase] 控制上浮，[t] 控制闪烁，[alphaScale] 为场景整体减淡系数。
  static void paintDots(
      Canvas canvas, Size size, double phase, double t, double alphaScale) {
    final w = size.width, h = size.height;
    if (w <= 0 || h <= 0) return;
    final dot = Paint()..blendMode = BlendMode.screen;
    for (int i = 0; i < _dots.length; i++) {
      final d = _dots[i];
      final bx = d.nx * w;
      final baseY = d.ny * h;
      final by = (baseY - (phase * h * 0.35 + i * 7) % h + h) % h;
      final tw = 0.4 + 0.6 * ((math.sin(t * 2 + i) + 1) / 2);
      final cool = i.isEven;
      dot.color = (cool ? AppTheme.aquaBright : AppTheme.goldLight)
          .withValues(alpha: (cool ? 0.22 : 0.12) * tw * alphaScale);
      canvas.drawCircle(Offset(bx, by), d.r, dot);
    }
  }

  @override
  bool shouldRepaint(covariant LiquidBackdropPainter old) =>
      old.phase != phase ||
      old.overlay != overlay ||
      old.dotsOnly != dotsOnly;
}

/// 背景微粒的固定参数：[nx]/[ny] 为归一化坐标（绘制时乘尺寸），[r] 为半径。
class _BgDot {
  final double nx, ny, r;
  const _BgDot(this.nx, this.ny, this.r);
}

/// V10 烘焙路径画笔：每帧 1 次全屏 drawImage + 微粒，无逐帧大 fill。
class _BakedBackdropPainter extends CustomPainter {
  final ui.Image base;
  final double phase;

  _BakedBackdropPainter({required this.base, required this.phase});

  @override
  void paint(Canvas canvas, Size size) {
    if (size.width <= 0 || size.height <= 0) return;
    canvas.drawImageRect(
      base,
      Rect.fromLTWH(
          0, 0, base.width.toDouble(), base.height.toDouble()),
      Offset.zero & size,
      Paint()..filterQuality = FilterQuality.low,
    );
    LiquidBackdropPainter.paintDots(
        canvas, size, phase, phase * 2 * math.pi, 0.7);
  }

  @override
  bool shouldRepaint(covariant _BakedBackdropPainter old) =>
      old.phase != phase;
}
