import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../utils/pricing.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/state_views.dart';

/// V10 剧本在线阅读页 - 查看大纲/初稿，提交修改意见或确认定稿
class ScriptReaderPage extends StatefulWidget {
  final int orderId;
  const ScriptReaderPage({super.key, required this.orderId});

  @override
  State<ScriptReaderPage> createState() => _ScriptReaderPageState();
}

class _ScriptReaderPageState extends State<ScriptReaderPage> {
  Map<String, dynamic>? _script;
  bool _loading = true;
  final _feedbackController = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _loadScript();
  }

  Future<void> _loadScript() async {
    if (mounted) setState(() => _loading = true);
    try {
      final data = await ApiService().getSampleScript(widget.orderId);
      if (mounted) setState(() { _script = data; _loading = false; });
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('剧本阅读')),
      body: _loading
          ? const LoadingView()
          : _script == null
          ? ErrorView(message: '剧本加载失败', onRetry: _loadScript)
          : _buildContent(),
      bottomNavigationBar: _script == null ? null : _buildBottomBar(),
    );
  }

  Widget _buildContent() {
    final s = _script!;
    final scriptStatus = s['scriptStatus'] as String? ?? 'pending';
    final revisions = (s['revisionCount'] as num?)?.toInt() ?? 0;
    final freeRevisions = (s['freeRevisions'] as num?)?.toInt() ?? 2;
    final draft = s['draft'] as String?;
    final outline = s['outline'] as String?;
    final title = s['scriptTitle'] as String?;
    final characters = (s['characters'] as List?) ?? [];
    final reference = s['reference'] as Map<String, dynamic>?;
    final feedback = (s['feedback'] as List?) ?? [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 状态卡
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.goldMain.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.25)),
          ),
          child: Row(
            children: [
              Icon(_statusIcon(scriptStatus), color: AppTheme.goldMain, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_statusText(scriptStatus), style: const TextStyle(color: AppTheme.goldLight, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text('已用修改轮次：$revisions/$freeRevisions（超出${(s['extraRevisionFee'] as num?)?.toInt() ?? Pricing.extraRevisionFee.toInt()}元/轮）',
                      style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        // 对标剧本
        if (reference != null) ...[
          const Text('对标参考', style: TextStyle(color: AppTheme.goldLight, fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: AppTheme.glassDecoration(radius: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(reference['title']?.toString() ?? '', style: const TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(reference['outline']?.toString() ?? '', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.5)),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
        // 剧本标题
        if (title != null) ...[
          Text(title, style: const TextStyle(color: AppTheme.goldLight, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),
        ],
        // 故事大纲
        if (outline != null) ...[
          const Text('故事大纲', style: TextStyle(color: AppTheme.goldLight, fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text(outline, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14, height: 1.8)),
          const SizedBox(height: 20),
        ],
        // 人物设定
        if (characters.isNotEmpty) ...[
          const Text('人物设定', style: TextStyle(color: AppTheme.goldLight, fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          ...characters.map((c) {
            if (c is Map) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.person_outline, size: 16, color: AppTheme.goldMain),
                    const SizedBox(width: 6),
                    Expanded(
                      child: RichText(
                        text: TextSpan(
                          style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13, height: 1.5),
                          children: [
                            TextSpan(text: '${c['name'] ?? ''}：', style: const TextStyle(fontWeight: FontWeight.bold, color: AppTheme.goldLight)),
                            TextSpan(text: c['desc']?.toString() ?? c['description']?.toString() ?? ''),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(c.toString(), style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
            );
          }),
          const SizedBox(height: 20),
        ],
        // 剧本初稿
        if (draft != null) ...[
          const Text('剧本初稿', style: TextStyle(color: AppTheme.goldLight, fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: AppTheme.glassDecoration(radius: 12),
            child: Text(draft, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13, height: 1.8)),
          ),
          const SizedBox(height: 20),
        ],
        // 修改意见输入
        if (scriptStatus == 'draft_ready' || scriptStatus == 'revising') ...[
          const Text('提交修改意见', style: TextStyle(color: AppTheme.goldLight, fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          TextField(
            controller: _feedbackController,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: '请描述您希望修改的内容，如剧情走向、人物设定、台词风格等',
            ),
          ),
          const SizedBox(height: 12),
          if (feedback.isNotEmpty) ...[
            const Text('历史修改意见', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            ...feedback.map((f) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.history, size: 14, color: AppTheme.textHint),
                  const SizedBox(width: 6),
                  Expanded(child: Text(f is Map ? (f['content']?.toString() ?? '') : f.toString(),
                    style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12))),
                ],
              ),
            )),
          ],
        ],
      ],
    );
  }

  Widget _buildBottomBar() {
    final scriptStatus = _script!['scriptStatus'] as String? ?? '';
    if (scriptStatus == 'draft_ready') {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: PrimaryButton(
                  isSecondary: true,
                  label: '提交修改意见',
                  state: _submitting ? ButtonState.loading : ButtonState.idle,
                  onPressed: _submitFeedback,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: PrimaryButton(
                  label: '确认定稿',
                  state: _submitting ? ButtonState.loading : ButtonState.idle,
                  onPressed: _finalizeScript,
                ),
              ),
            ],
          ),
        ),
      );
    }
    if (scriptStatus == 'revising') {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: PrimaryButton(
            label: '补充修改意见',
            state: _submitting ? ButtonState.loading : ButtonState.idle,
            onPressed: _submitFeedback,
          ),
        ),
      );
    }
    if (scriptStatus == 'finalized') {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppTheme.green.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppTheme.green.withValues(alpha: 0.3))),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.check_circle_rounded, color: AppTheme.green, size: 18),
                SizedBox(width: 8),
                Text('剧本已定稿，请支付制作款', style: TextStyle(color: AppTheme.green)),
              ],
            ),
          ),
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Future<void> _submitFeedback() async {
    if (_feedbackController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请输入修改意见')));
      return;
    }
    setState(() => _submitting = true);
    try {
      await ApiService().submitScriptFeedback(widget.orderId, _feedbackController.text.trim());
      if (mounted) {
        _feedbackController.clear();
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('修改意见已提交')));
        _loadScript();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('提交失败：$e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _finalizeScript() async {
    setState(() => _submitting = true);
    try {
      await ApiService().finalizeSampleScript(widget.orderId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('剧本已定稿')));
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('操作失败：$e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'writing': return Icons.edit;
      case 'draft_ready': return Icons.rate_review;
      case 'revising': return Icons.autorenew;
      case 'finalized': return Icons.check_circle;
      default: return Icons.hourglass_empty;
    }
  }

  String _statusText(String status) {
    switch (status) {
      case 'pending': return '等待编剧开始创作';
      case 'writing': return '编剧创作中，请耐心等待';
      case 'draft_ready': return '初稿已出，请查看并确认或提出修改意见';
      case 'revising': return '编剧正在根据您的意见修改';
      case 'finalized': return '剧本已定稿';
      default: return status;
    }
  }
}
