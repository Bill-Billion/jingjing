import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';

/// 全局统一网络图（V15 曜石流光 · 性能封装）。
///
/// 与 [CachedNetworkImage] 用法一致，额外做一件事：按**实际显示尺寸 × 设备像素比**
/// 限制解码分辨率（memCacheWidth），避免列表/网格把服务器高清原图整幅解码进内存
/// 再缩放（滑动卡顿、内存峰值高）。拿不到有限约束时回退 null（由原图解码，保证大图清晰）。
/// 仅做解码层优化，不改变占位、失败兜底、裁剪等任何视觉与交互。
class AppNetworkImage extends StatelessWidget {
  final String imageUrl;
  final BoxFit fit;
  final double? width;
  final double? height;
  final Widget Function(BuildContext context, String url)? placeholder;
  final Widget Function(BuildContext context, String url, Object error)?
      errorWidget;

  /// 解码物理像素上限：折叠屏展开 + 高 dpr 也足够清晰，同时封顶避免超大图吃内存。
  static const int _maxDecodeW = 1280;

  const AppNetworkImage({
    super.key,
    required this.imageUrl,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
    this.placeholder,
    this.errorWidget,
  });

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (ctx, constraints) {
      double? dip =
          constraints.maxWidth.isFinite ? constraints.maxWidth : width;
      dip ??= height;
      int? decodeW;
      if (dip != null && dip.isFinite && dip > 0) {
        final dpr = MediaQuery.maybeDevicePixelRatioOf(ctx) ?? 2.0;
        decodeW = (dip * dpr).clamp(1, _maxDecodeW).round();
      }
      return CachedNetworkImage(
        imageUrl: imageUrl,
        fit: fit,
        width: width,
        height: height,
        memCacheWidth: decodeW,
        placeholder: placeholder,
        errorWidget: errorWidget,
      );
    });
  }
}
