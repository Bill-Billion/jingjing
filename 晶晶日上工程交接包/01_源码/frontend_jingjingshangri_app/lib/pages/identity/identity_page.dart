import 'dart:io';
import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import 'package:image_picker/image_picker.dart';
import '../../theme/app_theme.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';
import '../../utils/motion.dart';
import '../../services/api_service.dart';

class IdentityPage extends StatefulWidget {
  const IdentityPage({super.key});

  @override
  State<IdentityPage> createState() => _IdentityPageState();
}

class _IdentityPageState extends State<IdentityPage> {
  final _picker = ImagePicker();
  String _type = 'personal';
  final _nameController = TextEditingController();
  final _idController = TextEditingController();
  final _phoneController = TextEditingController();
  XFile? _idFront;
  XFile? _idBack;
  bool _submitting = false;

  Future<void> _pickImage(bool isFront) async {
    try {
      final XFile? photo = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (photo != null) {
        setState(() {
          if (isFront) {
            _idFront = photo;
          } else {
            _idBack = photo;
          }
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('选择照片失败: $e')),
        );
      }
    }
  }

  Future<void> _submit() async {
    // MCN 机构仅通过独立 H5 管理后台入驻/运营，C 端不受理机构业务、不开放机构下单
    if (_type == 'mcn') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('MCN 机构请通过独立 H5 管理后台入驻与运营，C 端不开放机构业务'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    if (_nameController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写姓名/企业名称')),
      );
      return;
    }
    if (_idController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写证件号码')),
      );
      return;
    }
    if (_idFront == null || _idBack == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请上传证件正反面照片')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final res = await ApiService().submitIdentity({
        'identityType': _type,
        'realName': _nameController.text.trim(),
        'idCard': _idController.text.trim(),
      });
      if (!mounted) return;
      final status = res['status'] as String?;
      String tip;
      if (status == 'approved' && res['verifiedBy'] == 'aliyun_element') {
        tip = '实名认证已通过';
      } else if (status == 'approved') {
        tip = '实名信息已提交并记录（云端核验开通后自动升级为权威核验）';
      } else if (status == 'rejected') {
        tip = (res['rejectReason'] ?? '实名信息核验未通过，请核对后重试').toString();
      } else {
        tip = '已提交，等待平台审核';
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(tip), behavior: SnackBarBehavior.floating),
      );
      if (status != 'rejected') Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('提交失败，请检查网络后重试'), behavior: SnackBarBehavior.floating),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _idController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('身份认证')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.rimCyan.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.28)),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline_rounded, color: AppTheme.iceHighlight, size: 20),
                SizedBox(width: 12),
                Expanded(child: Text('完成身份认证后才能接单和提现。个人认证代扣6%税费，企业认证自行开票不代扣。', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.6))),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(children: [
            Container(width: 4, height: 16, decoration: BoxDecoration(gradient: AppTheme.brandGradient, borderRadius: BorderRadius.circular(2))),
            const SizedBox(width: 8),
            const Text('选择身份类型', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
          ]),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _typeChip('个人艺人', 'personal', Icons.person_outline_rounded),
              _typeChip('企业/个体户', 'enterprise', Icons.business_center_outlined),
              _typeChip('MCN机构', 'mcn', Icons.groups_outlined),
            ],
          ),
          const SizedBox(height: 20),
          TextField(controller: _nameController, decoration: InputDecoration(labelText: _type == 'enterprise' ? '企业名称' : '真实姓名')),
          const SizedBox(height: 12),
          TextField(controller: _idController, decoration: InputDecoration(labelText: _type == 'enterprise' ? '统一社会信用代码' : '身份证号')),
          const SizedBox(height: 12),
          TextField(controller: _phoneController, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: '手机号')),
          const SizedBox(height: 12),
          if (_type == 'mcn') ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.rimCyan.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.28)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.business_rounded, color: AppTheme.iceHighlight, size: 22),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'MCN 机构请通过独立 H5 管理后台完成入驻、艺人签约与运营；C 端仅面向买家与个人艺人，不开放机构下单。',
                      style: TextStyle(color: AppTheme.textSecondary, fontSize: 12.5, height: 1.6),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ] else ...[
            // 证件上传
            const Text('证件照片', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            const Text('请上传清晰的证件照片，支持拍照或从相册选择', style: TextStyle(color: AppTheme.textHint, fontSize: 12)),
            const SizedBox(height: 12),
            Row(
              children: [
                _uploadBox(_type == 'enterprise' ? '营业执照1' : '身份证正面', _idFront, true),
                const SizedBox(width: 12),
                _uploadBox(_type == 'enterprise' ? '营业执照2' : '身份证反面', _idBack, false),
              ],
            ),
            const SizedBox(height: 24),
          ],
          PrimaryButton(
            label: _type == 'mcn' ? '我知道了' : '提交认证',
            state: _submitting ? ButtonState.loading : ButtonState.idle,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }

  Widget _typeChip(String label, String value, IconData icon) {
    final selected = _type == value;
    return PressScale(
      onTap: () => setState(() => _type = value),
      borderRadius: BorderRadius.circular(999),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: Motion.short),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          gradient: selected ? AppTheme.brandGradientHorizontal : null,
          color: selected ? null : Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: selected ? Colors.transparent : AppTheme.goldMain.withValues(alpha: 0.25)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 16, color: selected ? AppTheme.onGold : AppTheme.goldMain),
          const SizedBox(width: 6),
          Text(label,
              style: TextStyle(
                  color: selected ? AppTheme.onGold : AppTheme.textSecondary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }

  Widget _uploadBox(String label, XFile? photo, bool isFront) {
    return Expanded(
      child: GestureDetector(
        onTap: () => _pickImage(isFront),
        child: Container(
          height: 120,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: photo != null ? AppTheme.goldMain.withValues(alpha: 0.45) : AppTheme.border),
          ),
          child: photo != null
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Image.file(File(photo.path), fit: BoxFit.cover, width: double.infinity),
                )
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.add_a_photo, color: AppTheme.textHint),
                    const SizedBox(height: 8),
                    Text(label, style: const TextStyle(color: AppTheme.textHint, fontSize: 12)),
                    const SizedBox(height: 4),
                    const Text('点击上传', style: TextStyle(color: AppTheme.textHint, fontSize: 10)),
                  ],
                ),
        ),
      ),
    );
  }
}
