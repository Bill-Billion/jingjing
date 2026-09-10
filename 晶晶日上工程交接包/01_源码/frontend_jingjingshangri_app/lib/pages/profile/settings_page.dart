import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../../services/app_mode.dart';
import '../../utils/app_version.dart';

/// V4.0 设置页：个性化推荐开关、青少年模式、算法备案信息
/// V15.5（A1）曜石流光玻璃化：分组玻璃卡 / 玻璃开关行 / 统一玻璃弹窗 /
/// 金渐变快捷胶囊与单选行；所有 prefs key、接口、路由名、连接与缓存逻辑保持不变。
class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _personalizationEnabled = true;
  bool _teenModeEnabled = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _personalizationEnabled = prefs.getBool('personalization_enabled') ?? true;
      _teenModeEnabled = prefs.getBool('teen_mode') ?? false;
    });
  }

  Future<void> _togglePersonalization(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('personalization_enabled', value);
    setState(() => _personalizationEnabled = value);
  }

  Future<void> _toggleTeenMode(bool value) async {
    if (value) {
      // 开启青少年模式需要验证
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => _glassDialog(
          title: '开启青少年模式',
          content: const Text(
              '青少年模式将限制单笔消费不超过500元，禁用私信和定制剧购买，并启用内容过滤。',
              style: TextStyle(
                  color: AppTheme.textSecondary, fontSize: 13, height: 1.6)),
          actions: [
            _dlgBtn('取消', onPressed: () => Navigator.pop(ctx, false)),
            _dlgBtn('确认开启',
                gold: true, onPressed: () => Navigator.pop(ctx, true)),
          ],
        ),
      );
      if (confirmed != true) return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('teen_mode', value);
    setState(() => _teenModeEnabled = value);
  }

  /// 统一曜石玻璃弹窗：20 圆角 + 克制金描边 + 内容可滚动防小屏溢出。
  AlertDialog _glassDialog({
    required String title,
    required Widget content,
    required List<Widget> actions,
  }) {
    return AlertDialog(
      backgroundColor: AppTheme.surfaceDark,
      surfaceTintColor: Colors.transparent,
      elevation: 14,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: BorderSide(color: AppTheme.goldMain.withValues(alpha: 0.16)),
      ),
      title: Text(title,
          style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 16.5,
              fontWeight: FontWeight.w800)),
      content: SingleChildScrollView(
        child: content,
      ),
      actions: actions,
      actionsPadding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
    );
  }

  /// 弹窗操作按钮：默认次级灰文，gold=金为主操作，danger=红色危险操作。
  Widget _dlgBtn(String text,
      {required VoidCallback? onPressed, bool gold = false, bool danger = false}) {
    final Color c = danger
        ? AppTheme.error
        : (gold ? AppTheme.goldMain : AppTheme.textSecondary);
    return TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        foregroundColor: c,
        textStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      child: Text(text),
    );
  }

  Widget _sectionTitle(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
        child: Row(children: [
          Container(
              width: 4,
              height: 14,
              decoration: BoxDecoration(
                  gradient: AppTheme.brandGradient,
                  borderRadius: BorderRadius.circular(2))),
          const SizedBox(width: 8),
          Text(t,
              style: const TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w800)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return LiquidScaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          _sectionTitle('隐私与推荐'),
          _SettingGroup(children: [
            _SettingTile(
              title: '个性化推荐',
              subtitle: '关闭后将不再根据您的偏好推荐数字人',
              trailing: _goldSwitch(_personalizationEnabled, _togglePersonalization),
            ),
            _SettingTile(
              title: '个人信息收集清单',
              onTap: () => _showInfoDialog('个人信息收集清单',
                  '1. 手机号/微信OpenID：用于账号注册登录\n'
                  '2. 人脸照片/视频：仅用于创建您的数字人，存储于加密私有空间，不公开\n'
                  '3. 位置信息：用于同城数字人推荐（可在系统设置中关闭）\n'
                  '4. 订单与支付信息：用于交易结算\n'
                  '5. 实名认证信息：用于艺人身份核验和税务代扣\n'
                  '我们不会将您的人脸数据用于训练AI模型，除非您单独同意。'),
            ),
            _SettingTile(
              title: '撤回数字人授权',
              subtitle: '撤回后180天内删除人脸数据',
              onTap: _showRevokeDialog,
            ),
          ]),
          _sectionTitle('青少年保护'),
          _SettingGroup(children: [
            _SettingTile(
              title: '青少年模式',
              subtitle: '限制消费、禁用私信、内容过滤',
              trailing: _goldSwitch(_teenModeEnabled, _toggleTeenMode),
            ),
          ]),
          _sectionTitle('连接与服务器'),
          _SettingGroup(children: [
            _SettingTile(
              title: '连接模式',
              subtitle: _modeSubtitle(),
              onTap: _showModeDialog,
            ),
            _SettingTile(
              title: '服务器地址',
              subtitle: ApiService().serverUrl,
              onTap: _showServerUrlDialog,
            ),
            _SettingTile(
              title: '测试连接',
              subtitle: '探测服务器是否可达，决定自动模式是否进入演示',
              trailing: const Icon(Icons.wifi_find_rounded,
                  color: AppTheme.goldMain, size: 20),
              onTap: _testConnection,
            ),
            _SettingTile(
              title: '清除缓存',
              subtitle: '清空本地登录态与缓存（保留连接模式与服务器地址）',
              trailing: const Icon(Icons.cleaning_services_outlined,
                  color: AppTheme.textHint, size: 20),
              onTap: _clearCache,
            ),
          ]),
          _sectionTitle('关于'),
          _SettingGroup(children: [
            _SettingTile(
              title: '算法备案信息',
              onTap: () => _showInfoDialog('算法备案信息',
                  '本平台使用以下算法服务：\n\n'
                  '1. 生成合成类算法：用于AI数字人视频生成\n'
                  '2. 个性化推送类算法：用于数字人推荐\n'
                  '3. 排序精选类算法：用于搜索结果排序\n\n'
                  '备案编号：待公示\n'
                  '您可以在上方关闭个性化推荐。'),
            ),
            _SettingTile(
              title: '用户协议',
              onTap: () => Navigator.pushNamed(context, '/agreement'),
            ),
            _SettingTile(
              title: '隐私政策',
              onTap: () => Navigator.pushNamed(context, '/privacy'),
            ),
            _SettingTile(
              title: '平台规则',
              onTap: () => _showInfoDialog('平台规则',
                  '禁止制作违法违规、侵犯他人肖像或知识产权的内容；定制剧为内容定制消费而非投资，'
                  '不承诺任何货币回报；交易纠纷可在订单页发起售后，平台将依规则介入处理。'),
            ),
            const _SettingTile(
              title: '版本信息',
              trailingText: kAppVersionLabel,
            ),
          ]),
        ],
      ),
    );
  }

  /// 曜石金开关（沿用新版 activeThumbColor 参数）。
  Widget _goldSwitch(bool value, ValueChanged<bool> onChanged) {
    return Switch(
      value: value,
      onChanged: onChanged,
      activeThumbColor: AppTheme.goldMain,
      activeTrackColor: AppTheme.goldMain.withValues(alpha: 0.35),
    );
  }

  Future<void> _showServerUrlDialog() async {
    final controller = TextEditingController(text: ApiService().serverUrl);
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => _glassDialog(
        title: '服务器地址',
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('输入后端服务器地址（含端口）：',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
            const SizedBox(height: 10),
            TextField(
              controller: controller,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14),
              decoration: const InputDecoration(
                hintText: 'https://www.jingjingrishang.com',
                isDense: true,
              ),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _quickUrlChip(ctx, '正式域名', 'https://www.jingjingrishang.com', controller),
                _quickUrlChip(ctx, '公网IP', 'http://8.222.213.43', controller),
                _quickUrlChip(ctx, 'Tailscale', 'http://100.119.240.117:3000', controller),
                _quickUrlChip(ctx, '局域网', 'http://192.168.1.82:3000', controller),
                _quickUrlChip(ctx, '模拟器', 'http://10.0.2.2:3000', controller),
              ],
            ),
          ],
        ),
        actions: [
          _dlgBtn('取消', onPressed: () => Navigator.pop(ctx)),
          _dlgBtn('保存', gold: true,
              onPressed: () => Navigator.pop(ctx, controller.text.trim())),
        ],
      ),
    );
    if (result != null && result.isNotEmpty) {
      await ApiService().setServerUrl(result);
      if (!mounted) return;
      setState(() {});
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('服务器地址已更新为: $result')),
      );
    }
  }

  Widget _quickUrlChip(BuildContext ctx, String label, String url, TextEditingController controller) {
    return GestureDetector(
      onTap: () => controller.text = url,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.25)),
        ),
        child: Text(label,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
      ),
    );
  }

  String _modeSubtitle() {
    final m = AppMode.instance;
    switch (m.mode) {
      case ConnMode.auto:
        return '自动 · 当前${m.isDemoNow ? "为演示模式（未连接到服务器）" : "已连接服务器"}';
      case ConnMode.online:
        return '强制在线 · 仅使用真实服务器数据';
      case ConnMode.demo:
        return '演示模式 · 完全离线，使用内置示例数据';
    }
  }

  Future<void> _showModeDialog() async {
    await showDialog<void>(
      context: context,
      builder: (ctx) => _glassDialog(
        title: '选择连接模式',
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _modeOption(ctx, ConnMode.auto, '自动（推荐）', '优先连服务器，连不上自动用示例数据'),
            _modeOption(ctx, ConnMode.online, '在线', '只走真实接口，联调/上线时使用'),
            _modeOption(ctx, ConnMode.demo, '演示', '完全离线，任何网络下都能完整演示'),
          ],
        ),
        actions: [
          _dlgBtn('关闭', onPressed: () => Navigator.pop(ctx)),
        ],
      ),
    );
  }

  /// 连接模式玻璃单选行（点整行即选中并关闭，逻辑同原 RadioGroup.onChanged）。
  Widget _modeOption(BuildContext ctx, ConnMode value, String title, String sub) {
    final selected = AppMode.instance.mode == value;
    return GestureDetector(
      onTap: () async {
        await AppMode.instance.setMode(value);
        if (!ctx.mounted) return;
        setState(() {});
        Navigator.pop(ctx);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected
              ? AppTheme.goldMain.withValues(alpha: 0.08)
              : Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: selected
                  ? AppTheme.goldMain.withValues(alpha: 0.5)
                  : AppTheme.border),
        ),
        child: Row(
          children: [
            Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_off_rounded,
                size: 20,
                color: selected ? AppTheme.goldMain : AppTheme.textHint),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(sub,
                      style: const TextStyle(
                          color: AppTheme.textSecondary, fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _clearCache() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => _glassDialog(
        title: '清除缓存',
        content: const Text('将清空本地登录态与缓存数据（连接模式、服务器地址保留），确定吗？'),
        actions: [
          _dlgBtn('取消', onPressed: () => Navigator.pop(ctx, false)),
          _dlgBtn('确定', gold: true,
              onPressed: () => Navigator.pop(ctx, true)),
        ],
      ),
    );
    if (ok == true) {
      await AppMode.instance.clearLocal();
      if (mounted) {
        setState(() {});
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('缓存已清除')));
      }
    }
  }

  Future<void> _testConnection() async {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('正在探测服务器...'), duration: Duration(seconds: 1)),
    );
    final ok = await ApiService().ping();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(ok
            ? '服务器可达，已切换为在线数据'
            : '服务器不可达，自动模式将使用演示数据（可在连接模式中查看）'),
        backgroundColor: ok ? AppTheme.success : AppTheme.error,
      ),
    );
    setState(() {});
  }

  void _showInfoDialog(String title, String content) {
    showDialog(
      context: context,
      builder: (ctx) => _glassDialog(
        title: title,
        content: Text(content,
            style: const TextStyle(
                color: AppTheme.textSecondary, fontSize: 13, height: 1.6)),
        actions: [
          _dlgBtn('知道了', gold: true, onPressed: () => Navigator.pop(ctx)),
        ],
      ),
    );
  }

  void _showRevokeDialog() {
    showDialog(
      context: context,
      builder: (ctx) => _glassDialog(
        title: '撤回数字人授权',
        content: const Text(
          '撤回授权后：\n'
          '1. 您的数字人将停止接单\n'
          '2. 人脸数据将在180天内删除\n'
          '3. 已交付的订单视频不受影响\n'
          '4. 钱包余额可正常提现\n\n'
          '确定要撤回吗？',
        ),
        actions: [
          _dlgBtn('再想想', onPressed: () => Navigator.pop(ctx)),
          _dlgBtn('确认撤回', danger: true, onPressed: () {
            Navigator.pop(ctx);
            ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('授权撤回申请已提交')));
          }),
        ],
      ),
    );
  }
}

/// 设置分组玻璃卡：行之间用极淡分隔线，InkWell 水波纹裁进圆角。
class _SettingGroup extends StatelessWidget {
  final List<Widget> children;
  const _SettingGroup({required this.children});

  @override
  Widget build(BuildContext context) {
    final separated = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      separated.add(children[i]);
      if (i != children.length - 1) {
        separated.add(Container(
          height: 1,
          margin: const EdgeInsets.symmetric(horizontal: 16),
          color: Colors.white.withValues(alpha: 0.06),
        ));
      }
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppTheme.radiusCard),
        child: GlassCard(
          padding: EdgeInsets.zero,
          shadow: true,
          child: Column(children: separated),
        ),
      ),
    );
  }
}

/// 统一设置行：左标题(+副标题)，右 trailing，可点；无原生灰底。
class _SettingTile extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final String? trailingText;
  final VoidCallback? onTap;
  const _SettingTile({
    required this.title,
    this.subtitle,
    this.trailing,
    this.trailingText,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final Widget? right = trailing ??
        (trailingText != null
            ? Text(trailingText!,
                style: const TextStyle(color: AppTheme.textHint, fontSize: 12.5))
            : (onTap != null
                ? const Icon(Icons.chevron_right_rounded,
                    color: AppTheme.textHint)
                : null));
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 13, 12, 13),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            color: AppTheme.textPrimary,
                            fontSize: 14.5,
                            fontWeight: FontWeight.w600)),
                    if (subtitle != null) ...[
                      const SizedBox(height: 3),
                      Text(subtitle!,
                          style: const TextStyle(
                              color: AppTheme.textSecondary, fontSize: 12, height: 1.4)),
                    ],
                  ],
                ),
              ),
              if (right != null) ...[const SizedBox(width: 10), right],
            ],
          ),
        ),
      ),
    );
  }
}
