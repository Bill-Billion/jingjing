import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../theme/app_theme.dart';
import '../services/api_service.dart';
import 'skeleton.dart';

/// 全局统一艺人头像/海报图（V15 曜石流光，档案21 §五「消灭纯黑空卡」）：
/// - 本地 asset（演示数据 localAvatar）优先；
/// - 否则走服务器地址（ApiService.resolveUrl 自动补域名）；
/// - 加载中：elev2 玻璃骨架微光（同形，不出现死黑）；
/// - 失败：品牌渐变 + 线性人像占位 + 点击重试；
/// - 真人图非动漫；任何状态都不允许大面积纯黑空块。
class HumanAvatar extends StatefulWidget {
  final String? localAsset;
  final String? remotePath;
  final BoxFit fit;
  final double? width;
  final double? height;
  final BorderRadius? radius;
  final IconData fallbackIcon;

  const HumanAvatar({
    super.key,
    this.localAsset,
    this.remotePath,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.radius,
    this.fallbackIcon = Icons.person_outline_rounded,
  });

  @override
  State<HumanAvatar> createState() => _HumanAvatarState();
}

class _HumanAvatarState extends State<HumanAvatar> {
  int _retryTick = 0;

  void _retry() => setState(() => _retryTick++);

  @override
  Widget build(BuildContext context) {
    final content = _build();
    if (widget.radius != null) {
      return ClipRRect(
          borderRadius: widget.radius!,
          child: SizedBox(width: widget.width, height: widget.height, child: content));
    }
    return SizedBox(width: widget.width, height: widget.height, child: content);
  }

  /// elev2 玻璃骨架微光（加载态）。
  Widget _placeholder() => Container(
        color: AppTheme.card,
        alignment: Alignment.center,
        child: const Skeleton(width: double.infinity, height: double.infinity),
      );

  /// 品牌渐变 + 线性人像占位，点击重试（失败态，绝不大面积死黑）。
  /// 小尺寸（<72，如列表/卡片 60 头像）只显示居中线性人像，避免固定内容溢出；
  /// 大尺寸才展示图标 +「点击重试」。
  Widget _fallback() => GestureDetector(
        onTap: _retry,
        behavior: HitTestBehavior.opaque,
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [AppTheme.bgGlowCard, AppTheme.surfaceDark],
            ),
          ),
          child: LayoutBuilder(builder: (ctx, constraints) {
            double? m;
            if (constraints.maxWidth.isFinite) m = constraints.maxWidth;
            if (constraints.maxHeight.isFinite) {
              m = m == null
                  ? constraints.maxHeight
                  : (constraints.maxHeight < m ? constraints.maxHeight : m);
            }
            final compact = m != null && m < 72;
            if (compact) {
              final size = (m * 0.46).clamp(20.0, 40.0);
              return Center(
                child: Icon(widget.fallbackIcon,
                    size: size, color: AppTheme.goldMain.withValues(alpha: 0.7)),
              );
            }
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(widget.fallbackIcon,
                      size: 44, color: AppTheme.goldMain.withValues(alpha: 0.7)),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.refresh,
                          size: 13, color: AppTheme.textSecondary),
                      const SizedBox(width: 4),
                      const Text('点击重试',
                          style: TextStyle(
                              color: AppTheme.textSecondary, fontSize: 11)),
                    ],
                  ),
                ],
              ),
            );
          }),
        ),
      );

  Widget _build() {
    // 性能：按实际显示尺寸×设备像素比限制解码分辨率，避免列表里把高清原图
    // 全尺寸解码再缩放（滑动卡顿/内存高占用）；拿不到有限尺寸时返回 null 保持原行为。
    return LayoutBuilder(builder: (_, constraints) {
      double? dip =
          constraints.maxWidth.isFinite ? constraints.maxWidth : widget.width;
      dip ??= widget.height;
      int? decodeW;
      if (dip != null && dip.isFinite && dip > 0) {
        final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 2.0;
        decodeW = (dip * dpr).clamp(1, 1024).round();
      }
      if (widget.localAsset != null && widget.localAsset!.isNotEmpty) {
        return Image.asset(widget.localAsset!,
            fit: widget.fit,
            width: widget.width,
            height: widget.height,
            cacheWidth: decodeW);
      }
      final url = ApiService().resolveUrl(widget.remotePath);
      if (url.isEmpty) return _fallback();
      return CachedNetworkImage(
        key: ValueKey('${url}_$_retryTick'),
        imageUrl: url,
        fit: widget.fit,
        width: widget.width,
        height: widget.height,
        memCacheWidth: decodeW,
        placeholder: (_, __) => _placeholder(),
        errorWidget: (_, __, ___) => _fallback(),
      );
    });
  }
}
