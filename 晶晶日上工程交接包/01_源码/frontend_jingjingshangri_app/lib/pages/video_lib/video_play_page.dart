import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../../theme/app_theme.dart';
import '../../utils/haptics.dart';
import '../../widgets/state_views.dart';

/// 把 `Duration` 格式化为 `m:ss`（小时以上为 `h:mm:ss`），纯函数便于单测。
String formatVideoPosition(Duration d) {
  if (d.isNegative) d = Duration.zero;
  final h = d.inHours;
  final m = d.inMinutes.remainder(60);
  final s = d.inSeconds.remainder(60);
  final ss = s.toString().padLeft(2, '0');
  if (h > 0) {
    final mm = m.toString().padLeft(2, '0');
    return '$h:$mm:$ss';
  }
  return '$m:$ss';
}

/// 全屏网络视频播放器（我的视频·成片播放）。
///
/// 仅接收**已解析的完整 https 地址**（由调用方 ApiService.resolveUrl 得到），
/// 自身不碰业务/接口；三态：加载中 / 失败可重试 / 就绪播放。
/// 横屏竖屏视频均按原始比例自适应，控制器在 dispose 时严格释放。
class VideoPlayPage extends StatefulWidget {
  final String url;
  final String title;

  const VideoPlayPage({
    super.key,
    required this.url,
    this.title = '成片播放',
  });

  @override
  State<VideoPlayPage> createState() => _VideoPlayPageState();
}

class _VideoPlayPageState extends State<VideoPlayPage> {
  VideoPlayerController? _controller;
  bool _initializing = true;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _controller?.removeListener(_onTick);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    setState(() {
      _initializing = true;
      _failed = false;
    });
    final old = _controller;
    if (old != null) {
      old.removeListener(_onTick);
      old.dispose();
    }
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _controller = controller;
    controller.addListener(_onTick);
    try {
      await controller.initialize();
      if (!mounted) return;
      await controller.play();
      setState(() => _initializing = false);
    } catch (_) {
      Haptics.warn();
      if (!mounted) return;
      setState(() {
        _initializing = false;
        _failed = true;
      });
    }
  }

  void _onTick() {
    // 控制器状态（播放/暂停/进度/出错）变化时刷新；组件卸载后不再 setState。
    if (!mounted) return;
    final c = _controller;
    if (c == null) return;
    if (c.value.hasError && !_failed) {
      setState(() => _failed = true);
      return;
    }
    setState(() {});
  }

  void _togglePlay() {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return;
    Haptics.tick();
    if (c.value.isPlaying) {
      c.pause();
    } else {
      c.play();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: AppTheme.surfaceDark,
        title: Text(widget.title,
            maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: SafeArea(
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_failed) {
      return ErrorView(
        message: '视频加载失败，请检查网络后重试',
        retryText: '重新加载',
        onRetry: _init,
      );
    }
    final c = _controller;
    if (_initializing || c == null || !c.value.isInitialized) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 34,
              height: 34,
              child: CircularProgressIndicator(
                  strokeWidth: 2.4, color: AppTheme.goldMain),
            ),
            SizedBox(height: 14),
            Text('视频加载中…',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
          ],
        ),
      );
    }
    return Column(
      children: [
        Expanded(
          child: Center(
            child: AspectRatio(
              aspectRatio: c.value.aspectRatio,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ColoredBox(
                    color: Colors.black,
                    child: VideoPlayer(c),
                  ),
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _togglePlay,
                    child: Center(
                      child: AnimatedOpacity(
                        opacity: c.value.isPlaying ? 0.0 : 1.0,
                        duration: const Duration(milliseconds: 180),
                        child: Container(
                          width: 58,
                          height: 58,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.black.withValues(alpha: 0.5),
                            border: Border.all(
                                color: AppTheme.goldMain.withValues(alpha: 0.6)),
                          ),
                          child: Icon(
                            c.value.isPlaying
                                ? Icons.pause_rounded
                                : Icons.play_arrow_rounded,
                            color: AppTheme.goldMain,
                            size: 34,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        _buildControlBar(c),
      ],
    );
  }

  Widget _buildControlBar(VideoPlayerController c) {
    return Container(
      color: AppTheme.surfaceDark,
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      child: Row(
        children: [
          _CircleIconButton(
            icon: c.value.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
            onTap: _togglePlay,
          ),
          const SizedBox(width: 8),
          Text(formatVideoPosition(c.value.position),
              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: VideoProgressIndicator(
                c,
                allowScrubbing: true,
                padding: const EdgeInsets.symmetric(vertical: 8),
                colors: VideoProgressColors(
                  playedColor: AppTheme.goldMain,
                  bufferedColor: AppTheme.goldLight.withValues(alpha: 0.35),
                  backgroundColor: Colors.white.withValues(alpha: 0.12),
                ),
              ),
            ),
          ),
          Text(formatVideoPosition(c.value.duration),
              style: const TextStyle(color: AppTheme.textHint, fontSize: 11)),
        ],
      ),
    );
  }
}

/// 播放控制条上的圆形播放/暂停小按钮；触感统一由 [_VideoPlayPageState._togglePlay]
/// 内的 Haptics.tick 发出（与画面中央手势同一路径，避免双震），故这里用纯手势。
class _CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _CircleIconButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: 0.06),
          border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.4)),
        ),
        child: Icon(icon, color: AppTheme.goldMain, size: 22),
      ),
    );
  }
}
