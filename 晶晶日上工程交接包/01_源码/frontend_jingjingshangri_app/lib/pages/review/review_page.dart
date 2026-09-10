import 'dart:io';
import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import 'package:image_picker/image_picker.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/glass_card.dart';
import '../../widgets/press_scale.dart';

/// V5.0 订单评价页面
/// 订单完成后7天内可评价：四维星级 + 文字 + 图片（最多6张）
/// 提交走 POST /api/order-reviews（演示模式自动本地兜底），成功后 pop(true) 回写订单列表
class ReviewPage extends StatefulWidget {
  final String orderNo;
  final String orderType; // video | endorsement
  final String talentName;

  const ReviewPage({
    super.key,
    required this.orderNo,
    this.orderType = 'video',
    this.talentName = '',
  });

  @override
  State<ReviewPage> createState() => _ReviewPageState();
}

class _ReviewPageState extends State<ReviewPage> {
  final ApiService _api = ApiService();
  final ImagePicker _picker = ImagePicker();
  int _quality = 5;
  int _speed = 5;
  int _service = 5;
  int _accuracy = 5;
  final _contentController = TextEditingController();
  final List<String> _images = []; // 本地文件路径；demo: 前缀为演示占位
  bool _submitting = false;

  @override
  void dispose() {
    _contentController.dispose();
    super.dispose();
  }

  double get _overall =>
      (_quality * 0.4 + _speed * 0.2 + _service * 0.2 + _accuracy * 0.2);

  Widget _buildStarRow(String label, int value, ValueChanged<int> onChanged) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          SizedBox(
            width: 68,
            child: Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: AppTheme.textSecondary, fontSize: 14)),
          ),
          ...List.generate(5, (i) {
            return GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => onChanged(i + 1),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Icon(
                  i < value ? Icons.star : Icons.star_border,
                  color: AppTheme.goldMain,
                  size: 22,
                ),
              ),
            );
          }),
          const SizedBox(width: 6),
          Text('$value.0',
              style: const TextStyle(color: AppTheme.goldMain, fontSize: 13)),
        ],
      ),
    );
  }

  /// 选图：优先真实相册（image_picker）；当前设备不支持/失败时用演示占位兜底，最多6张
  Future<void> _pickImage() async {
    if (_images.length >= 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('最多上传6张图片')),
      );
      return;
    }
    try {
      final x = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 1600,
      );
      if (x == null) return;
      setState(() => _images.add(x.path));
    } catch (e) {
      if (!mounted) return;
      setState(() => _images.add('demo:${DateTime.now().millisecondsSinceEpoch}'));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('当前环境无法调起相册，已加入演示占位图')),
      );
    }
  }

  Future<void> _submit() async {
    if (_contentController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请填写评价内容')),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final orderType =
          widget.orderType == 'endorsement' ? 'endorsement' : 'video';
      final resp = await _api.submitReview({
        'orderNo': widget.orderNo,
        'orderType': orderType,
        'qualityRating': _quality,
        'speedRating': _speed,
        'serviceRating': _service,
        'accuracyRating': _accuracy,
        'content': _contentController.text.trim(),
        'images': _images.where((e) => !e.startsWith('demo:')).toList(),
      });
      if (!mounted) return;
      final demo = resp['isDemo'] == true;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(demo
                ? '演示模式：评价已提交（正式版将真实提交）'
                : (resp['message']?.toString() ?? '评价提交成功，感谢您的反馈！'))),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('提交失败：$e')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('评价订单')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GlassCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Text(
                    _overall.toStringAsFixed(1),
                    style: const TextStyle(
                        color: AppTheme.goldMain,
                        fontSize: 40,
                        fontWeight: FontWeight.bold),
                  ),
                  const Text('综合评分',
                      style: TextStyle(
                          color: AppTheme.textSecondary, fontSize: 13)),
                  const SizedBox(height: 8),
                  Text(
                    widget.talentName.isNotEmpty
                        ? '订单：${widget.orderNo}　艺人：${widget.talentName}'
                        : '订单：${widget.orderNo}',
                    style: const TextStyle(
                        color: AppTheme.textPrimary, fontSize: 12),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text('评分维度',
                style: TextStyle(
                    color: AppTheme.goldLight,
                    fontSize: 16,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            _buildStarRow('视频质量', _quality, (v) => setState(() => _quality = v)),
            _buildStarRow('交付速度', _speed, (v) => setState(() => _speed = v)),
            _buildStarRow('服务态度', _service, (v) => setState(() => _service = v)),
            _buildStarRow('符合描述', _accuracy, (v) => setState(() => _accuracy = v)),
            const SizedBox(height: 20),
            const Text('评价内容',
                style: TextStyle(
                    color: AppTheme.goldLight,
                    fontSize: 16,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            TextField(
              controller: _contentController,
              maxLines: 5,
              maxLength: 500,
              style: const TextStyle(
                  color: AppTheme.textPrimary, fontSize: 14),
              decoration: const InputDecoration(
                hintText: '分享您的体验：视频效果如何？艺人服务态度怎么样？',
              ),
            ),
            const SizedBox(height: 8),
            PressScale(
              onTap: _submitting ? null : _pickImage,
              borderRadius: BorderRadius.circular(999),
              child: Container(
                height: 46,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.3)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.add_a_photo_outlined, size: 18, color: AppTheme.goldMain),
                  const SizedBox(width: 8),
                  Flexible(child: Text(_images.isEmpty
                      ? '添加图片（最多6张）'
                      : '已添加 ${_images.length}/6 张，点击继续添加',
                      style: const TextStyle(color: AppTheme.goldLight, fontSize: 13, fontWeight: FontWeight.w600))),
                ]),
              ),
            ),
            if (_images.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: List.generate(_images.length, (i) {
                  final p = _images[i];
                  return Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: p.startsWith('demo:')
                            ? Container(
                                width: 72,
                                height: 72,
                                color: AppTheme.surfaceDark,
                                child: const Icon(Icons.image_outlined,
                                    color: AppTheme.textHint),
                              )
                            : Image.file(File(p),
                                width: 72, height: 72, fit: BoxFit.cover),
                      ),
                      Positioned(
                        right: 0,
                        top: 0,
                        child: GestureDetector(
                          onTap: () => setState(() => _images.removeAt(i)),
                          child: Container(
                            decoration: const BoxDecoration(
                              color: Colors.black54,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.close,
                                size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  );
                }),
              ),
            ],
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: PrimaryButton(
     label: '提交评价',
     state: _submitting ? ButtonState.loading : ButtonState.idle,
     onPressed: _submit,
   ),
            ),
            const SizedBox(height: 12),
            const Text(
              '评价将在审核通过后公开展示，请勿包含违规内容或联系方式。',
              style: TextStyle(color: AppTheme.textHint, fontSize: 12),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
