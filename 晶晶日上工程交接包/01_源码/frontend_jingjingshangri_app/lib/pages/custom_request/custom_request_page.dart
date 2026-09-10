import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/press_scale.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/milestone_bar.dart';

/// V10 高端定制需求提交页（一剧一议，商务线下跟进）
/// V15.5（A1）曜石流光玻璃化：仅替换视觉层（选项胶囊/玻璃输入/玻璃卡），
/// 表单字段、校验、预算换算、submitCustomRequest 提交逻辑保持不变。
class CustomRequestPage extends StatefulWidget {
  const CustomRequestPage({super.key});

  @override
  State<CustomRequestPage> createState() => _CustomRequestPageState();
}

class _CustomRequestPageState extends State<CustomRequestPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _descController = TextEditingController();
  final _specialController = TextEditingController();

  String _selectedGenre = '古装逆袭';
  String _selectedFormat = '短剧';
  String _budgetRange = '50-100万';
  bool _submitting = false;

  static const _genres = ['古装逆袭', '都市甜宠', '悬疑推理', '家庭伦理', '青春校园', '职场商战', '军旅谍战', '其他'];
  static const _formats = ['电影', '中剧', '短剧', '网络大电影'];
  static const _budgets = ['5-20万', '20-50万', '50-100万', '100-300万', '300-500万', '500万以上'];

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
                fontSize: 15,
                fontWeight: FontWeight.w800)),
      ]);

  /// 单选项胶囊：选中=金渐变，未选=玻璃描边（与 AI 创作台一致）。
  Widget _pill(String text, bool selected, VoidCallback onTap) {
    return PressScale(
      onTap: onTap,
      borderRadius: BorderRadius.circular(99),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
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

  /// 选项分区：弱玻璃容器统一三组单选项（类型/格式/预算）的结构层级，
  /// 顶部图标标题 + 右侧“已选：xx”实时回显（只读，不改选择逻辑）。
  Widget _optionSection(String t, IconData icon, String selected, Widget child) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.14)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: AppTheme.goldMain),
              const SizedBox(width: 8),
              Text(t,
                  style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w800)),
              const Spacer(),
              Text('已选：$selected',
                  style: const TextStyle(
                      color: AppTheme.textHint, fontSize: 11.5)),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('高端定制')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // 说明卡
            GlassCard(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppTheme.surfaceDark, AppTheme.card],
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('高端定制 · 一剧一议',
                      style: TextStyle(
                          color: AppTheme.goldLight,
                          fontSize: 18,
                          fontWeight: FontWeight.bold)),
                  SizedBox(height: 8),
                  Text('价格几万到几百万不等，可含金牌编剧、知名导演、明星参演。提交需求后商务将在24小时内1对1联系，签订正式合同后按里程碑付款（剧本审核20%/开机25%/粗剪审核25%/成片交付30%）。',
                      style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                          height: 1.6)),
                ],
              ),
            ),
            const SizedBox(height: 20),
            // 联系方式
            _label('联系方式'),
            const SizedBox(height: 12),
            TextFormField(
              controller: _nameController,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14.5),
              decoration: const InputDecoration(labelText: '姓名', hintText: '请输入您的姓名'),
              validator: (v) => (v == null || v.isEmpty) ? '请输入姓名' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14.5),
              decoration: const InputDecoration(labelText: '手机号', hintText: '请输入手机号'),
              validator: (v) {
                if (v == null || v.isEmpty) return '请输入手机号';
                if (!RegExp(r'^1[3-9]\d{9}$').hasMatch(v)) return '手机号格式不正确';
                return null;
              },
            ),
            const SizedBox(height: 20),
            // 类型
            _optionSection(
              '剧集类型',
              Icons.theater_comedy_rounded,
              _selectedGenre,
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _genres
                    .map((g) => _pill(g, _selectedGenre == g,
                        () => setState(() => _selectedGenre = g)))
                    .toList(),
              ),
            ),
            const SizedBox(height: 14),
            // 格式
            _optionSection(
              '剧集格式',
              Icons.movie_filter_rounded,
              _selectedFormat,
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _formats
                    .map((f) => _pill(f, _selectedFormat == f,
                        () => setState(() => _selectedFormat = f)))
                    .toList(),
              ),
            ),
            const SizedBox(height: 14),
            // 预算
            _optionSection(
              '预算范围',
              Icons.payments_rounded,
              _budgetRange,
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _budgets
                    .map((b) => _pill(b, _budgetRange == b,
                        () => setState(() => _budgetRange = b)))
                    .toList(),
              ),
            ),
            const SizedBox(height: 20),
            // 特殊需求
            _label('特殊需求'),
            const SizedBox(height: 10),
            TextFormField(
              controller: _specialController,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14.5),
              decoration: const InputDecoration(
                labelText: '特殊要求（选填）',
                hintText: '如：需要金牌编剧、知名导演、明星参演、特定拍摄地点等',
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _descController,
              maxLines: 4,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14.5, height: 1.6),
              decoration: const InputDecoration(
                labelText: '项目描述',
                hintText: '请简要描述您的项目构想、目标受众、期望风格等',
                alignLabelWithHint: true,
              ),
              validator: (v) => (v == null || v.isEmpty) ? '请描述您的项目需求' : null,
            ),
            const SizedBox(height: 20),
            // 里程碑说明
            GlassCard(
              color: Colors.white.withValues(alpha: 0.03),
              shadow: false,
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('付款里程碑',
                      style: TextStyle(
                          color: AppTheme.textPrimary,
                          fontWeight: FontWeight.w600,
                          fontSize: 13)),
                  SizedBox(height: 10),
                  MilestoneBar(stages: [
                    ('剧本审核', '20%'),
                    ('开机', '25%'),
                    ('粗剪审核', '25%'),
                    ('成片交付', '30%'),
                  ]),
                ],
              ),
            ),
            const SizedBox(height: 24),
            PrimaryButton(
              label: '提交需求，等待商务联系',
              state: _submitting ? ButtonState.loading : ButtonState.idle,
              onPressed: _submit,
            ),
            const SizedBox(height: 12),
            const Text('提交即表示您同意我们的商务人员通过电话与您联系',
                style: TextStyle(color: AppTheme.textHint, fontSize: 11),
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final budgetParts = _budgetRange.replaceAll(RegExp(r'[^0-9-]'), '').split('-');
      final budgetMin = budgetParts.isNotEmpty ? int.tryParse(budgetParts[0]) : null;
      final budgetMax = budgetParts.length > 1 ? int.tryParse(budgetParts[1]) : null;

      await ApiService().submitCustomRequest({
        'name': _nameController.text.trim(),
        'phone': _phoneController.text.trim(),
        'genre': _selectedGenre,
        'format': _selectedFormat,
        'budgetMin': budgetMin != null ? budgetMin * 10000 * 100 : null,
        'budgetMax': budgetMax != null ? budgetMax * 10000 * 100 : null,
        'specialRequirements': _specialController.text.trim(),
        'description': _descController.text.trim(),
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('需求已提交，商务将在24小时内联系您')));
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('提交失败：$e')));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
