import 'dart:async';
import '../../widgets/app_network_image.dart';
import 'package:flutter/material.dart';
import '../../widgets/motion_fx.dart';
import '../../widgets/liquid_scaffold.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/user_provider.dart';
import '../../utils/motion.dart';
import '../../widgets/primary_button.dart';
import 'my_works_page.dart';

/// AI 生成阶段定义（档案14 §五）：线性阶段，只前进不回退。
class AiStage {
  final String key;
  final String label;
  const AiStage(this.key, this.label);
}

const _imageStages = [
  AiStage('queued', '排队中'),
  AiStage('composing', '理解需求 · 画面构图'),
  AiStage('refining', '细节生成 · 精修'),
  AiStage('done', '出图完成'),
];
const _videoStages = [
  AiStage('queued', '排队中'),
  AiStage('script', '理解需求 · 生成脚本'),
  AiStage('shots', '分镜生成'),
  AiStage('render', '视频渲染'),
  AiStage('compose', '合成出片'),
  AiStage('done', '出片完成'),
];

/// AI 任务进度页：创建任务后进入，轮询 /api/ai/task/:id，完成后成品入「我的作品」。
class AiTaskPage extends StatefulWidget {
  /// 初始任务体（createAiImage/createAiVideo 返回的 task）
  final Map<String, dynamic> task;
  final String kind; // 'image' | 'video'
  final String prompt;

  const AiTaskPage({
    super.key,
    required this.task,
    required this.kind,
    required this.prompt,
  });

  @override
  State<AiTaskPage> createState() => _AiTaskPageState();
}

class _AiTaskPageState extends State<AiTaskPage> {
  final ApiService _api = ApiService();
  Timer? _timer;
  late Map<String, dynamic> _task;
  int _percent = 0; // 单调递增的总进度
  int _polls = 0;
  bool _saved = false;
  String? _error;

  List<AiStage> get _stages =>
      widget.kind == 'video' ? _videoStages : _imageStages;

  String get _taskId => '${_task['id'] ?? _task['taskId'] ?? ''}';

  @override
  void initState() {
    super.initState();
    _task = Map<String, dynamic>.from(widget.task);
    _schedule();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _schedule() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(milliseconds: 1500), (_) => _poll());
    _poll();
  }

  Future<void> _poll() async {
    _polls++;
    try {
      final res = await _api.getAiTask(_taskId);
      final t = (res['task'] is Map)
          ? Map<String, dynamic>.from(res['task'] as Map)
          : null;
      if (!mounted) return;
      if (t != null) {
        setState(() => _task = t);
        _advance(t);
        final status = '${t['status']}';
        if (status == 'succeeded') {
          _timer?.cancel();
          _onSucceeded(t);
        } else if (status == 'failed') {
          _timer?.cancel();
          setState(() => _error = '${t['error'] ?? '生成失败，请调整描述后重试'}');
        }
      }
    } catch (e) {
      // 偶发失败不立刻中断，超过 20 次仍失败才报错
      if (_polls > 20 && mounted) {
        _timer?.cancel();
        setState(() => _error = '网络异常，任务进度中断，请稍后在我的作品查看');
      }
    }
  }

  /// 线性推进：后端 progress 只增不减；映射到阶段。
  void _advance(Map<String, dynamic> t) {
    var p = 0;
    if (t['progress'] is num) p = (t['progress'] as num).round();
    if (p < _percent) p = _percent; // 不回退
    if ('${t['status']}' == 'succeeded') p = 100;
    setState(() => _percent = p.clamp(0, 100));
  }

  /// 当前阶段索引
  int _stageIndex() {
    final key = '${_task['stage'] ?? 'queued'}';
    final idx = _stages.indexWhere((e) => e.key == key);
    if (idx >= 0) return idx;
    if (_percent >= 100) return _stages.length - 1;
    final scaled = (_percent / 100 * (_stages.length - 1)).floor();
    return scaled.clamp(0, _stages.length - 1);
  }

  Future<void> _onSucceeded(Map<String, dynamic> t) async {
    if (_percent < 100) setState(() => _percent = 100);
    if (_saved) return;
    _saved = true;
    final work = <String, dynamic>{
      'taskId': _taskId,
      'kind': widget.kind,
      'prompt': widget.prompt,
      'resultUrl': t['resultUrl'],
      'localResult': t['localResult'],
      'status': 'succeeded',
      'createdAt': t['createdAt'] ?? DateTime.now().toIso8601String(),
    };
    await context.read<UserProvider>().addMyWork(work);
  }

  Future<void> _retry() async {
    setState(() {
      _error = null;
      _polls = 0;
      _task['status'] = 'running';
    });
    _schedule();
  }

  @override
  Widget build(BuildContext context) {
    final succeeded = _percent >= 100 && '${_task['status']}' == 'succeeded';
    final failed = _error != null;
    final stageIdx = succeeded ? _stages.length - 1 : _stageIndex();

    return LiquidScaffold(
      appBar: AppBar(title: Text(widget.kind == 'video' ? 'AI 生成视频' : 'AI 生成图片')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildPromptCard(),
              const SizedBox(height: 20),
              _buildProgressRing(succeeded, failed, stageIdx),
              const SizedBox(height: 22),
              ...List.generate(_stages.length, (i) {
                final done = i < stageIdx || succeeded;
                final active = i == stageIdx && !succeeded;
                return FadeSlideIn(
                  delayMs: 120 + i * 60,
                  durationMs: Motion.short,
                  beginOffset: const Offset(0.06, 0),
                  child: _stageRow(_stages[i], done, active),
                );
              }),
              const SizedBox(height: 26),
              if (succeeded)
                FadeSlideIn(
                  beginOffset: const Offset(0, 0.05),
                  child: _buildResult(),
                )
              else if (failed)
                FadeSlideIn(
                    durationMs: Motion.short, child: _buildFailed())
              else
                _buildHint(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPromptCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: AppTheme.glassDecoration(radius: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.edit_note_rounded, color: AppTheme.goldLight, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(widget.prompt,
                style: const TextStyle(
                    color: AppTheme.textPrimary, fontSize: 13.5, height: 1.6)),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressRing(bool succeeded, bool failed, int stageIdx) {
    return Center(
      child: SizedBox(
        width: 150,
        height: 150,
        child: Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              width: 150,
              height: 150,
              child: TweenAnimationBuilder<double>(
                tween: Tween(begin: 0, end: _percent / 100),
                duration: const Duration(milliseconds: Motion.sheet),
                curve: Motion.inOut,
                builder: (_, v, __) => CircularProgressIndicator(
                  value: v,
                  strokeWidth: 9,
                  backgroundColor: Colors.white.withValues(alpha: 0.07),
                  valueColor: AlwaysStoppedAnimation(
                      failed ? AppTheme.errorStrong : AppTheme.goldMain),
                ),
              ),
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(succeeded ? '完成' : '$_percent%',
                    style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 30,
                        fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text(
                  succeeded
                      ? '已存入我的作品'
                      : failed
                          ? '生成中断'
                          : _stages[stageIdx.clamp(0, _stages.length - 1)].label,
                  style: const TextStyle(
                      color: AppTheme.textSecondary, fontSize: 11.5),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _stageRow(AiStage stage, bool done, bool active) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: Motion.short),
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: done ? AppTheme.brandGradient : null,
              color: done ? null : Colors.white.withValues(alpha: 0.06),
              border: Border.all(
                  color: active
                      ? AppTheme.goldMain
                      : Colors.white.withValues(alpha: 0.12)),
            ),
            child: done
                ? const Icon(Icons.check, size: 15, color: AppTheme.onGold)
                : active
                    ? const Padding(
                        padding: EdgeInsets.all(7),
                        child: CircularProgressIndicator(
                            strokeWidth: 1.6, color: AppTheme.goldLight),
                      )
                    : const SizedBox.shrink(),
          ),
          const SizedBox(width: 12),
          Text(stage.label,
              style: TextStyle(
                color: done
                    ? AppTheme.textPrimary
                    : active
                        ? AppTheme.goldLight
                        : AppTheme.textHint,
                fontSize: 14,
                fontWeight: active || done ? FontWeight.w700 : FontWeight.w500,
              )),
          const Spacer(),
          if (done)
            const Text('已完成',
                style: TextStyle(color: AppTheme.successLight, fontSize: 11.5))
          else if (active)
            const Text('进行中…',
                style: TextStyle(color: AppTheme.goldLight, fontSize: 11.5)),
        ],
      ),
    );
  }

  Widget _buildHint() {
    return Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
      ),
      child: const Row(
        children: [
          Icon(Icons.info_outline_rounded, size: 18, color: AppTheme.textHint),
          SizedBox(width: 8),
          Expanded(
            child: Text('生成期间可离开本页，完成后成品会自动存入「我的-我的作品」',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.5)),
          ),
        ],
      ),
    );
  }

  Widget _buildFailed() {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(13),
          decoration: BoxDecoration(
            color: AppTheme.errorSurface,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              const Icon(Icons.error_outline_rounded,
                  size: 18, color: AppTheme.errorLight),
              const SizedBox(width: 8),
              Expanded(
                child: Text(_error!,
                    style: const TextStyle(
                        color: AppTheme.errorSoft, fontSize: 12, height: 1.5)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        PrimaryButton(
          label: '重新生成',
          onPressed: _retry,
          isSecondary: true,
        ),
      ],
    );
  }

  Widget _buildResult() {
    final url = ApiService().resolveUrl(_task['resultUrl'] as String?);
    final local = _task['localResult'] as String?;
    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: widget.kind == 'video'
              ? _videoResult(local, url)
              : (local != null
                  ? Image.asset(local, fit: BoxFit.cover)
                  : url.isNotEmpty
                      ? AppNetworkImage(imageUrl: url, fit: BoxFit.cover)
                      : _pendingBox(
                          icon: Icons.auto_awesome,
                          hint: '成片即将就位，可稍后在我的作品查看')),
        ),
        const SizedBox(height: 16),
        PrimaryButton(
          label: '查看我的作品',
          icon: Icons.collections,
          onPressed: () => Navigator.of(context).pushReplacement(
              Motion.fadeSlideRoute(const MyWorksPage())),
        ),
      ],
    );
  }

  Widget _videoResult(String? local, String url) {
    if (url.isNotEmpty) {
      return Container(
        height: 180,
                        color: AppTheme.surfaceDark,
        alignment: Alignment.center,
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.play_circle_fill_rounded, size: 56, color: AppTheme.goldLight),
            SizedBox(height: 8),
            Text('视频已生成，可在我的作品播放',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
          ],
        ),
      );
    }
    // 无本地/远程成片时走统一占位（A6），不再叠一层半透明黑导致发空。
    if (local == null) {
      return _pendingBox(
        icon: Icons.movie_creation_outlined,
        hint: '成片即将就位，可稍后在我的作品查看',
      );
    }
    return Stack(
      alignment: Alignment.center,
      children: [
        Image.asset(local, fit: BoxFit.cover, width: double.infinity),
        Container(
          height: 180,
          color: Colors.black.withValues(alpha: 0.35),
        ),
        const Icon(Icons.play_circle_fill_rounded, size: 56, color: Colors.white),
      ],
    );
  }

  /// 成片资源未就位（弱网/尚未取回）时的统一无文字破图占位：
  /// 曜石玻璃底 + 克制金图标 + 一行 Flutter 叠加提示，图片/视频共用同一视觉。
  Widget _pendingBox({required IconData icon, required String hint}) => Container(
        height: 200,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Colors.white.withValues(alpha: 0.04),
              AppTheme.goldMain.withValues(alpha: 0.06),
            ],
          ),
          border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.16)),
        ),
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 44, color: AppTheme.goldLight),
            const SizedBox(height: 10),
            Text(hint,
                style: const TextStyle(color: AppTheme.textHint, fontSize: 12)),
          ],
        ),
      );
}
