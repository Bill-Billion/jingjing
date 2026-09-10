import 'dart:io';
import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import 'package:image_picker/image_picker.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import 'package:provider/provider.dart';
import '../../services/user_provider.dart';
import '../../utils/motion.dart';
import '../../utils/pricing.dart';
import '../my_humans/my_humans_page.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/press_scale.dart';
import '../../widgets/motion_fx.dart';

/// V10 AI试镜/创建数字人 - 一屏一授权设计
/// 每步明确告知用途，不用长篇协议
/// V15.5（A1/A2）去掉 Material Stepper，改曜石分步流（步骤条+玻璃卡+金胶囊+
/// 自定义勾选+步骤切换动效）；每步门槛校验、拍照、活体演示、createHuman 提交逻辑零改动。
class AuditionPage extends StatefulWidget {
  const AuditionPage({super.key});

  @override
  State<AuditionPage> createState() => _AuditionPageState();
}

class _AuditionPageState extends State<AuditionPage> {
  final _picker = ImagePicker();
  int _step = 0;
  bool _submitting = false;
  String _style = '古风';
  final _nameController = TextEditingController();

  // 选中的照片
  XFile? _photo;
  // 活体检测状态
  bool _livenessPassed = false;

  // V5.0 授权范围
  bool _scopeVideo = true;
  bool _scopeEndorsement = false;
  bool _scopeFilm = false;

  // V5.0 一屏一授权：每步同意状态
  bool _photoConsented = false;
  bool _livenessConsented = false;

  static const _stepNames = ['上传照片', '真人验证', '选择风格', '命名', '授权范围', '确认创建'];

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto(ImageSource source) async {
    try {
      final XFile? photo = await _picker.pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (photo != null) {
        setState(() => _photo = photo);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('选择照片失败: $e')),
        );
      }
    }
  }

  void _showPhotoSourceSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => Container(
        decoration: const BoxDecoration(
          color: AppTheme.surfaceDark,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          border: Border(
            top: BorderSide(color: Color(0x26E6C586)),
          ),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(99))),
              const SizedBox(height: 8),
              _sheetRow(Icons.photo_camera_rounded, '拍照', AppTheme.goldMain, () {
                Navigator.pop(sheetCtx);
                _pickPhoto(ImageSource.camera);
              }),
              _sheetRow(Icons.photo_library_rounded, '从相册选择', AppTheme.goldMain, () {
                Navigator.pop(sheetCtx);
                _pickPhoto(ImageSource.gallery);
              }),
              if (_photo != null)
                _sheetRow(Icons.delete_outline_rounded, '移除照片', AppTheme.error, () {
                  Navigator.pop(sheetCtx);
                  setState(() => _photo = null);
                }),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sheetRow(IconData icon, String text, Color color, VoidCallback onTap) {
    return PressScale(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(children: [
          Icon(icon, color: color, size: 21),
          const SizedBox(width: 14),
          Text(text,
              style: TextStyle(
                  color: color == AppTheme.error
                      ? AppTheme.error
                      : AppTheme.textPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }

  void _startLiveness() {
    // 真人验证步骤：后端已接入阿里云实人核身（/api/face-verify + /api/compliance/sign 服务端复验）；
  // 未配置云端凭证/向导内暂无照片URL时走离线演示，最终是否可签署授权由服务端核身结论强制判定
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.surfaceDark,
        surfaceTintColor: Colors.transparent,
        elevation: 14,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: AppTheme.goldMain.withValues(alpha: 0.16)),
        ),
        title: const Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.science_rounded, color: AppTheme.goldMain, size: 18),
          SizedBox(width: 6),
          Text('真人验证（演示）',
              style: TextStyle(color: AppTheme.goldLight, fontWeight: FontWeight.w800)),
        ]),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 2.2, color: AppTheme.goldMain)),
            SizedBox(height: 16),
            Text('当前为离线演示；正式授权签署时，服务端将以阿里云实人核身结论为准',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.6)),
          ],
        ),
      ),
    );
    Future.delayed(const Duration(seconds: 2), () {
      if (!mounted) return;
      Navigator.pop(context);
      setState(() => _livenessPassed = true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('真人验证步骤完成（离线演示；正式签署以服务端阿里云核身为准）')),
      );
    });
  }

  Future<void> _submit() async {
    // 防重复提交双保险：PrimaryButton 在 loading 态已拦截点击，这里再挡一次任何路径的重入。
    if (_submitting) return;
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请给数字人起个名字')),
      );
      return;
    }
    if (_photo == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请上传照片')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      // 调用后端API创建数字人
      final res = await ApiService().createHuman(
        name: _nameController.text.trim(),
        style: _style,
        photoPath: _photo!.path,
        scopeVideo: _scopeVideo,
        scopeEndorsement: _scopeEndorsement,
        scopeFilm: _scopeFilm,
      );
      final data = (res['data'] is Map) ? Map<String, dynamic>.from(res['data'] as Map) : res;
      final human = <String, dynamic>{
        ...data,
        'name': _nameController.text.trim(),
        'style': _style,
        'tags': [_style],
        'localPhoto': _photo?.path,
        'scopeVideo': _scopeVideo,
        'scopeEndorsement': _scopeEndorsement,
        'scopeFilm': _scopeFilm,
        'status': data['status'] ?? 'pending',
        'statusText': '审核中',
      };
      if (mounted) {
        await context.read<UserProvider>().addMyHuman(human);
      }
      if (mounted) {
        Navigator.pop(context);
        Navigator.of(context).push(Motion.fadeSlideRoute(const MyHumansPage(justCreated: true)));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('创建失败：$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  /// 下一步门槛校验（逻辑同原 Stepper.onStepContinue），通过返回 true。
  bool _validateStep() {
    void warn(String t) => ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(t)));
    if (_step == 0 && !_photoConsented) {
      warn('请先阅读并同意照片使用说明');
      return false;
    }
    if (_step == 0 && _photo == null) {
      warn('请先上传照片');
      return false;
    }
    if (_step == 1 && !_livenessConsented) {
      warn('请先阅读并同意活体检测说明');
      return false;
    }
    if (_step == 1 && !_livenessPassed) {
      warn('请先完成活体检测');
      return false;
    }
    if (_step == 3 && _nameController.text.trim().isEmpty) {
      warn('请给数字人起个名字');
      return false;
    }
    if (_step == 4 && !_scopeVideo && !_scopeEndorsement && !_scopeFilm) {
      warn('请至少选择一项授权范围');
      return false;
    }
    return true;
  }

  void _onContinue() {
    if (_step == 5) {
      _submit();
      return;
    }
    if (!_validateStep()) return;
    setState(() => _step = (_step + 1).clamp(0, 5));
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('创建数字人')),
      body: Column(
        children: [
          _StepBar(current: _step, names: _stepNames),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
              child: FadeSlideIn(
                key: ValueKey<int>(_step),
                durationMs: 280,
                child: _stepContent(_step),
              ),
            ),
          ),
          _bottomControls(),
        ],
      ),
    );
  }

  Widget _bottomControls() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Row(
        children: [
          if (_step > 0) ...[
            SizedBox(
              height: 50,
              width: 88,
              child: PressScale(
                borderRadius: BorderRadius.circular(AppTheme.radiusControl),
                onTap: () => setState(() => _step = (_step - 1).clamp(0, 5)),
                child: Container(
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(AppTheme.radiusControl),
                    border: Border.all(color: AppTheme.border),
                  ),
                  child: const Text('上一步',
                      style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontWeight: FontWeight.w700)),
                ),
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: SizedBox(
              height: 50,
              child: PrimaryButton(
                label: _step == 5 ? '同意并创建' : '下一步',
                state: _submitting ? ButtonState.loading : ButtonState.idle,
                onPressed: _onContinue,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _stepContent(int step) {
    switch (step) {
      case 0:
        return _photoStep();
      case 1:
        return _livenessStep();
      case 2:
        return _styleStep();
      case 3:
        return _nameStep();
      case 4:
        return _scopeStep();
      default:
        return _confirmStep();
    }
  }

  // ── 步骤一：上传照片 ─────────────────────────────────────────────
  Widget _photoStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _showPhotoSourceSheet,
          child: Container(
            height: 200,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                  color: AppTheme.goldMain.withValues(alpha: 0.28), width: 1.2),
            ),
            child: _photo != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: Image.file(File(_photo!.path),
                        fit: BoxFit.cover, width: double.infinity),
                  )
                : Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                Color(0x33FFFFFF),
                                Color(0x167FD4E0),
                                Color(0x0A3FA9C0),
                              ],
                            ),
                            border: Border.all(
                                color: AppTheme.rimCyan.withValues(alpha: 0.45)),
                          ),
                          child: const Icon(Icons.add_a_photo_rounded,
                              size: 30, color: AppTheme.iceHighlight),
                        ),
                        const SizedBox(height: 12),
                        const Text('点击上传正面清晰照片',
                            style: TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 14,
                                fontWeight: FontWeight.w600)),
                        const SizedBox(height: 4),
                        const Text('支持拍照或从相册选择',
                            style:
                                TextStyle(color: AppTheme.textHint, fontSize: 11.5)),
                      ],
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 12),
        _InfoCard(
          icon: Icons.info_outline_rounded,
          title: '照片用途说明',
          body: '我们仅将您的照片用于创建AI数字人形象，不存储原始照片，仅提取加密特征向量。',
        ),
        const SizedBox(height: 10),
        _photoTips(),
        const SizedBox(height: 4),
        _ConsentTile(
          value: _photoConsented,
          onChanged: (v) => setState(() => _photoConsented = v),
          title: '我已知晓照片用途，同意上传',
        ),
      ],
    );
  }

  // 真人照片拍摄要点（呼应“真人头像非动漫/网图”铁律，纯引导、不参与校验逻辑）。
  Widget _photoTips() {
    const tips = [
      '本人真实正脸，五官清晰，勿戴墨镜、口罩、帽子遮挡',
      '正对镜头、光线均匀、单人出镜，避免强逆光与过度美颜',
      '请勿上传动漫形象、网络图片或他人照片，以免无法通过真人核验',
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (final t in tips)
            Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 5,
                    height: 5,
                    margin: const EdgeInsets.only(top: 6.5),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppTheme.goldMain.withValues(alpha: 0.75),
                    ),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(t,
                        style: const TextStyle(
                            color: AppTheme.textHint,
                            fontSize: 11.5,
                            height: 1.45)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  // ── 步骤二：真人验证 ─────────────────────────────────────────────
  Widget _livenessStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _livenessConsented && !_livenessPassed ? _startLiveness : null,
          child: Container(
            height: 140,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: _livenessPassed
                    ? AppTheme.success.withValues(alpha: 0.6)
                    : AppTheme.goldMain.withValues(alpha: 0.28),
                width: 1.2,
              ),
            ),
            child: Center(
              child: _livenessPassed
                  ? const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check_circle_rounded,
                            size: 44, color: AppTheme.success),
                        SizedBox(height: 8),
                        Text('活体检测已通过',
                            style: TextStyle(
                                color: AppTheme.success,
                                fontWeight: FontWeight.w700)),
                      ],
                    )
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 64,
                          height: 64,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: const LinearGradient(
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                              colors: [
                                Color(0x33FFFFFF),
                                Color(0x167FD4E0),
                                Color(0x0A3FA9C0),
                              ],
                            ),
                            border: Border.all(
                                color: AppTheme.rimCyan.withValues(alpha: 0.45)),
                          ),
                          child: const Icon(Icons.face_retouching_natural_rounded,
                              size: 30, color: AppTheme.iceHighlight),
                        ),
                        const SizedBox(height: 12),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 20),
                          child: Text('点击开始真人验证（演示，正式版为眨眼/转头活体检测）',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                  color: AppTheme.textSecondary, fontSize: 12.5)),
                        ),
                      ],
                    ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        _InfoCard(
          icon: Icons.shield_outlined,
          title: '活体检测说明',
          body: '真人验证用于确认是您本人操作，防止他人冒用您的肖像。正式版接入持牌活体SDK，检测过程不录制视频、不存储生物识别原始数据；当前为演示流程。',
        ),
        const SizedBox(height: 6),
        _ConsentTile(
          value: _livenessConsented,
          onChanged: (v) => setState(() => _livenessConsented = v),
          title: '我已知晓，开始验证',
        ),
      ],
    );
  }

  // ── 步骤三：选择风格 ─────────────────────────────────────────────
  Widget _styleStep() {
    const styles = ['古风', '现代', '武侠', '商务', '青春', '都市'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('选择数字人的形象风格',
            style: TextStyle(
                color: AppTheme.textSecondary, fontSize: 13, height: 1.5)),
        const SizedBox(height: 14),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: styles.map((s) => _stylePill(s)).toList(),
        ),
      ],
    );
  }

  Widget _stylePill(String s) {
    final selected = s == _style;
    return PressScale(
      onTap: () => setState(() => _style = s),
      borderRadius: BorderRadius.circular(99),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        decoration: BoxDecoration(
          gradient: selected ? AppTheme.brandGradient : null,
          color: selected ? null : Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(
              color: selected
                  ? Colors.transparent
                  : AppTheme.goldMain.withValues(alpha: 0.25)),
        ),
        child: Text(s,
            style: TextStyle(
              color: selected ? AppTheme.onGold : AppTheme.textSecondary,
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
            )),
      ),
    );
  }

  // ── 步骤四：命名 ─────────────────────────────────────────────────
  Widget _nameStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('给你的数字人起一个名字',
            style: TextStyle(
                color: AppTheme.textSecondary, fontSize: 13, height: 1.5)),
        const SizedBox(height: 14),
        TextField(
          controller: _nameController,
          onChanged: (_) => setState(() {}),
          maxLength: 12,
          style: const TextStyle(color: AppTheme.textPrimary, fontSize: 15),
          decoration: const InputDecoration(
            labelText: '数字人名称',
            hintText: '如：苏婉儿',
            counterText: '',
          ),
        ),
      ],
    );
  }

  // ── 步骤五：授权范围 ─────────────────────────────────────────────
  Widget _scopeStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('选择您的数字人可以被用于哪些场景（可多选，可随时修改）：',
            style: TextStyle(color: AppTheme.textSecondary, fontSize: 12.5, height: 1.5)),
        const SizedBox(height: 10),
        GlassCard(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
          child: Column(
            children: [
              _ConsentTile(
                value: _scopeVideo,
                onChanged: (v) => setState(() => _scopeVideo = v),
                title: '祝福视频',
                subtitle: '其他用户可付费请您的数字人录制祝福视频',
              ),
              Divider(height: 1, color: Colors.white.withValues(alpha: 0.06)),
              _ConsentTile(
                value: _scopeEndorsement,
                onChanged: (v) => setState(() => _scopeEndorsement = v),
                title: '品牌代言',
                subtitle: '品牌方可付费邀请您的数字人拍摄商业代言视频',
              ),
              Divider(height: 1, color: Colors.white.withValues(alpha: 0.06)),
              _ConsentTile(
                value: _scopeFilm,
                onChanged: (v) => setState(() => _scopeFilm = v),
                title: '定制剧参演',
                subtitle: '您的数字人可参与定制剧项目演出',
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── 步骤六：确认摘要 ─────────────────────────────────────────────
  Widget _confirmStep() {
    final scope = [
      if (_scopeVideo) '祝福视频',
      if (_scopeEndorsement) '品牌代言',
      if (_scopeFilm) '定制剧参演',
    ].join('、');
    return GlassCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('授权摘要',
              style: TextStyle(
                  color: AppTheme.goldLight,
                  fontSize: 15,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          _summaryRow('数字人名称', _nameController.text.isEmpty ? '未命名' : _nameController.text),
          _summaryRow('风格', _style),
          _summaryRow('照片', _photo != null ? '已上传' : '未上传'),
          _summaryRow('真人验证', _livenessPassed ? '已通过（演示）' : '未通过'),
          _summaryRow('授权范围', scope.isEmpty ? '未选择' : scope),
          _summaryRow('授权期限', '3年（到期可续期，可随时撤回）'),
          _summaryRow('数据使用', '人脸特征加密存储，不存储原始照片'),
          _summaryRow('版权归属', '生成视频著作权归您所有，平台获非独家商业使用权'),
          _summaryRow('保证金', '首笔收入中冻结${Pricing.artistDeposit.toInt()}元，退出时无纠纷可退'),
          const SizedBox(height: 10),
          const Text('生成后可在艺人广场展示，接祝福视频和品牌代言订单',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.6)),
          const SizedBox(height: 4),
          const Text('也可进一步发起定制剧，做自己人生的主角',
              style: TextStyle(color: AppTheme.goldMain, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _summaryRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
              width: 84,
              child: Text(label,
                  style: const TextStyle(color: AppTheme.textHint, fontSize: 12))),
          Expanded(
              child: Text(value,
                  style: const TextStyle(
                      color: AppTheme.textPrimary, fontSize: 12.5, height: 1.4))),
        ],
      ),
    );
  }
}

/// 顶部步骤条：已完成金勾 / 当前金渐变描边 / 未到灰点 + 连接线与当前步骤名。
class _StepBar extends StatelessWidget {
  final int current;
  final List<String> names;
  const _StepBar({required this.current, required this.names});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 6),
      child: Column(
        children: [
          Row(
            children: List.generate(names.length * 2 - 1, (i) {
              if (i.isOdd) {
                final before = (i - 1) ~/ 2;
                return Expanded(
                  child: Container(
                    height: 2,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(99),
                      gradient: before < current
                          ? AppTheme.brandGradient
                          : null,
                      color: before < current
                          ? null
                          : Colors.white.withValues(alpha: 0.08),
                    ),
                  ),
                );
              }
              final idx = i ~/ 2;
              final done = idx < current;
              final active = idx == current;
              return Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: (done || active) ? AppTheme.brandGradient : null,
                  color: (done || active)
                      ? null
                      : Colors.white.withValues(alpha: 0.05),
                  border: active
                      ? Border.all(color: AppTheme.goldLight, width: 1.2)
                      : Border.all(color: AppTheme.border),
                  boxShadow: (done || active)
                      ? [
                          BoxShadow(
                              color: AppTheme.goldMain.withValues(alpha: 0.3),
                              blurRadius: 8,
                              offset: const Offset(0, 2))
                        ]
                      : null,
                ),
                child: done
                    ? const Icon(Icons.check_rounded,
                        size: 14, color: AppTheme.onGold)
                    : Text('${idx + 1}',
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: active
                              ? AppTheme.onGold
                              : AppTheme.textHint,
                        )),
              );
            }),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: Text('第 ${current + 1}/${names.length} 步 · ${names[current]}',
                style: const TextStyle(
                    color: AppTheme.goldLight,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5)),
          ),
        ],
      ),
    );
  }
}

/// 统一授权勾选项：整行可点 + 金渐变自定义勾选框。
class _ConsentTile extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  final String title;
  final String? subtitle;
  const _ConsentTile({
    required this.value,
    required this.onChanged,
    required this.title,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => onChanged(!value),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              width: 22,
              height: 22,
              margin: const EdgeInsets.only(top: 1),
              decoration: BoxDecoration(
                gradient: value ? AppTheme.brandGradient : null,
                color: value ? null : Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(7),
                border: Border.all(
                    color: value
                        ? Colors.transparent
                        : AppTheme.goldMain.withValues(alpha: 0.35),
                    width: 1.2),
              ),
              child: value
                  ? const Icon(Icons.check_rounded, size: 15, color: AppTheme.onGold)
                  : null,
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: subtitle != null ? 14 : 13.5,
                          fontWeight: FontWeight.w600)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!,
                        style: const TextStyle(
                            color: AppTheme.textHint, fontSize: 11.5, height: 1.4)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 步骤内统一玻璃说明卡（淡金青、14 圆角）。
class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  const _InfoCard({required this.icon, required this.title, required this.body});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, color: AppTheme.goldMain, size: 16),
            const SizedBox(width: 6),
            Text(title,
                style: const TextStyle(
                    color: AppTheme.goldMain,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 7),
          Text(body,
              style: const TextStyle(
                  color: AppTheme.textSecondary, fontSize: 12, height: 1.55)),
        ],
      ),
    );
  }
}
