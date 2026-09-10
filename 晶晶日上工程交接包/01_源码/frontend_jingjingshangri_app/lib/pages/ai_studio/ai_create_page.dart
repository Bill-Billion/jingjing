import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/motion.dart';
import '../../utils/responsive.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';
import 'ai_task_page.dart';

/// AI 创作台：文生图 / 文生视频 表单，提交后进入线性阶段进度页。
class AiCreatePage extends StatefulWidget {
  final String initialKind; // 'image' | 'video'
  const AiCreatePage({super.key, this.initialKind = 'image'});

  @override
  State<AiCreatePage> createState() => _AiCreatePageState();
}

class _AiCreatePageState extends State<AiCreatePage> {
  final ApiService _api = ApiService();
  final TextEditingController _promptCtrl = TextEditingController();
  late String _kind = widget.initialKind == 'video' ? 'video' : 'image';

  // 图片参数
  String _size = '1024x1024';
  // 视频参数
  int _duration = 5;
  String _ratio = '16:9';

  ButtonState _submitState = ButtonState.idle;

  static const _imageSizes = ['1024x1024', '1024x1408', '1408x1024'];
  static const _durations = [5, 10];
  static const _ratios = ['16:9', '9:16', '1:1'];

  static const _inspirations = [
    '暖光电影感，一位古风少年站在黄昏城墙上，浅景深，写实人像',
    '现代都市夜景，女性创业者手持咖啡站在落地窗前，柔和暖光',
    '武侠风格，竹林薄雾中持剑侠客回眸，胶片质感，真实人物',
    '商务形象照，西装男士，影棚柔光，浅灰背景，写实',
  ];

  @override
  void dispose() {
    _promptCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final prompt = _promptCtrl.text.trim();
    if (prompt.length < 4) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请再详细描述一下你想要的画面（至少 4 个字）')),
      );
      return;
    }
    setState(() => _submitState = ButtonState.loading);
    try {
      Map<String, dynamic> envelope;
      if (_kind == 'image') {
        envelope = await _api.createAiImage(prompt: prompt, size: _size);
      } else {
        envelope = await _api.createAiVideo(
          type: 't2v',
          prompt: prompt,
          duration: _duration,
          ratio: _ratio,
        );
      }
      final task = (envelope['task'] is Map)
          ? Map<String, dynamic>.from(envelope['task'] as Map)
          : <String, dynamic>{
              'id': envelope['id'] ?? envelope['taskId'],
              'status': 'pending',
              'progress': 0,
            };
      if (!mounted) return;
      setState(() => _submitState = ButtonState.idle);
      Navigator.push(
        context,
        Motion.fadeSlideRoute(AiTaskPage(task: task, kind: _kind, prompt: prompt)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitState = ButtonState.errorState);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('创建任务失败，请稍后重试')),
      );
      Future.delayed(const Duration(milliseconds: 1500), () {
        if (mounted) setState(() => _submitState = ButtonState.idle);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('AI 创作台')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _buildKindSwitch(),
                const SizedBox(height: 18),
                _label('画面描述'),
                const SizedBox(height: 8),
                TextField(
                  controller: _promptCtrl,
                  maxLines: 5,
                  maxLength: 500,
                  style: const TextStyle(
                      color: AppTheme.textPrimary, fontSize: 14.5, height: 1.6),
                  decoration: InputDecoration(
                    hintText: _kind == 'image'
                        ? '描述人物、场景、光线与风格，例如：暖光电影感的古风少女…'
                        : '描述一段动态画面，例如：黄昏海边，人物缓缓转身，镜头推进…',
                    alignLabelWithHint: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 6),
                _buildInspirations(),
                const SizedBox(height: 18),
                if (_kind == 'image') _buildImageOptions() else _buildVideoOptions(),
                const SizedBox(height: 26),
                PrimaryButton(
                  label: _kind == 'image' ? '立即生成图片' : '立即生成视频',
                  icon: Icons.auto_fix_high_rounded,
                  state: _submitState,
                  onPressed: _submit,
                  successText: '任务已创建',
                ),
                const SizedBox(height: 14),
                const Text(
                  '生成过程分阶段展示，可离开本页；成品会自动存入「我的-我的作品」',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppTheme.textHint, fontSize: 11.5, height: 1.5),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(String t) => Row(children: [
        Container(
            width: 4,
            height: 15,
            decoration: BoxDecoration(
                gradient: AppTheme.brandGradient,
                borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 8),
        Text(t,
            style: const TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 14.5,
                fontWeight: FontWeight.w800)),
      ]);

  Widget _buildKindSwitch() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          _kindTab('image', Icons.image, '文生图'),
          _kindTab('video', Icons.videocam, '文生视频'),
        ],
      ),
    );
  }

  Widget _kindTab(String kind, IconData icon, String text) {
    final selected = _kind == kind;
    return Expanded(
      child: PressScale(
        onTap: () => setState(() => _kind = kind),
        borderRadius: BorderRadius.circular(11),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: Motion.short),
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            gradient: selected ? AppTheme.brandGradient : null,
            borderRadius: BorderRadius.circular(11),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon,
                  size: 17,
                  color: selected ? AppTheme.onGold : AppTheme.textSecondary),
              const SizedBox(width: 6),
              Text(text,
                  style: TextStyle(
                    color: selected ? AppTheme.onGold : AppTheme.textSecondary,
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                  )),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildInspirations() {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: _inspirations
          .map((e) => PressScale(
                onTap: () => _promptCtrl.text = e,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(99),
                    border: Border.all(
                        color: AppTheme.goldMain.withValues(alpha: 0.25)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.tips_and_updates_outlined,
                          size: 13, color: AppTheme.goldLight),
                      const SizedBox(width: 5),
                      ConstrainedBox(
                        constraints: BoxConstraints(
                            maxWidth: Responsive.useRail(context) ? 360 : 240),
                        child: Text(e,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: AppTheme.textSecondary, fontSize: 11.5)),
                      ),
                    ],
                  ),
                ),
              ))
          .toList(),
    );
  }

  Widget _buildImageOptions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label('画幅比例'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: _imageSizes.map((e) => _optionChip(e, _size == e, () {
            setState(() => _size = e);
          })).toList(),
        ),
      ],
    );
  }

  Widget _buildVideoOptions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label('画幅比例'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: _ratios.map((e) => _optionChip(e, _ratio == e, () {
            setState(() => _ratio = e);
          })).toList(),
        ),
        const SizedBox(height: 16),
        _label('时长'),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: _durations
              .map((e) => _optionChip('$e 秒', _duration == e, () {
                    setState(() => _duration = e);
                  }))
              .toList(),
        ),
      ],
    );
  }

  Widget _optionChip(String text, bool selected, VoidCallback onTap) {
    return PressScale(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          gradient: selected ? AppTheme.brandGradient : null,
          color: selected ? null : Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(
              color: selected
                  ? Colors.transparent
                  : AppTheme.goldMain.withValues(alpha: 0.25)),
        ),
        child: Text(text,
            style: TextStyle(
              color: selected ? AppTheme.onGold : AppTheme.textSecondary,
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
            )),
      ),
    );
  }
}
