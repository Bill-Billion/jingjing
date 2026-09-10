import 'package:flutter/material.dart';
import '../../widgets/liquid_scaffold.dart';
import '../../widgets/glass_card.dart';
import '../project_brief/project_brief_page.dart';
import '../../theme/app_theme.dart';
import '../../services/api_service.dart';
import '../sample_order_detail/sample_order_detail_page.dart';
import '../../utils/motion.dart';
import '../../widgets/primary_button.dart';
import '../../widgets/press_scale.dart';
import '../../utils/pricing.dart';
import '../../utils/money.dart';

class ProjectDetailPage extends StatefulWidget {
  final Map<String, dynamic> project;
  const ProjectDetailPage({super.key, required this.project});

  @override
  State<ProjectDetailPage> createState() => _ProjectDetailPageState();
}

class _ProjectDetailPageState extends State<ProjectDetailPage> {
  // 意向金下单防重复（在途时拦截二次提交，避免重复 ${Money.rmbInt(Pricing.intentDeposit)} 订单）
  bool _starting = false;

  Map<String, dynamic> get project => widget.project;

  @override
  Widget build(BuildContext context) {
    final claimed = ((project['seatsClaimed'] ?? project['claimed'] ?? 0) as num).toInt();
    final total = ((project['seatsTotal'] ?? project['total'] ?? 100) as num).toInt();
    final percent = (claimed / total).clamp(0.0, 1.0);
    final localCover = project['localCover'] as String?;

    return LiquidScaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 240,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: (localCover != null && localCover.isNotEmpty)
                  ? Image.asset(localCover, fit: BoxFit.cover)
                  : Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft, end: Alignment.bottomRight,
                          colors: [
                            Colors.white.withValues(alpha: 0.05),
                            AppTheme.cyanSoft.withValues(alpha: 0.10),
                            AppTheme.cyanDeep.withValues(alpha: 0.06),
                          ],
                        ),
                      ),
                      child: const Center(child: Icon(Icons.movie_creation_outlined, size: 60, color: AppTheme.iceHighlight)),
                    ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(project['title'] as String, style: const TextStyle(color: AppTheme.goldLight, fontSize: 24, fontWeight: FontWeight.bold, fontFamily: AppTheme.serifFont)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                            color: AppTheme.goldMain.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: AppTheme.goldMain.withValues(alpha: 0.25))),
                        child: Text(project['type'] as String, style: const TextStyle(color: AppTheme.goldMain, fontSize: 12)),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(color: AppTheme.success.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(999)),
                        child: Text(_statusText(project['status']?.toString()), style: const TextStyle(color: AppTheme.success, fontSize: 12)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // 席位认领数据（内容交付口径，非筹款）
                  Row(
                    children: [
                      Expanded(child: _dataItem('已认领席位', '$claimed 席', AppTheme.goldMain)),
                      Container(width: 1, height: 40, color: AppTheme.border),
                      Expanded(child: _dataItem('开放席位', '$total 席', AppTheme.textPrimary)),
                      Container(width: 1, height: 40, color: AppTheme.border),
                      Expanded(child: _dataItem('参与人数', '${project['clientCount'] ?? project['backers'] ?? 0}人', AppTheme.textPrimary)),
                    ],
                  ),
                  const SizedBox(height: 16),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      value: percent.toDouble(),
                      backgroundColor: Colors.white.withValues(alpha: 0.06),
                      valueColor: const AlwaysStoppedAnimation(AppTheme.goldMain),
                      minHeight: 8,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text('席位认领 ${(percent * 100).toStringAsFixed(0)}% · 剩余招募${project['days'] ?? 0}天', style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                  const SizedBox(height: 24),
                  // Tab栏
                  DefaultTabController(
                    length: 4,
                    child: Column(
                      children: [
                        TabBar(
                          labelColor: AppTheme.goldMain,
                          unselectedLabelColor: AppTheme.textSecondary,
                          indicatorColor: AppTheme.goldMain,
                          indicatorWeight: 2.5,
                          indicatorSize: TabBarIndicatorSize.label,
                          labelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w800),
                          unselectedLabelStyle: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w500),
                          tabs: const [
                            Tab(text: '项目介绍'),
                            Tab(text: '角色档位'),
                            Tab(text: '项目计划书'),
                            Tab(text: '动态'),
                          ],
                        ),
                        SizedBox(
                          height: 400,
                          child: TabBarView(
                            children: [
                              _buildIntro(),
                              _buildRoles(),
                              _buildDoc(context),
                              _buildUpdates(),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: FrostedBar(
          tint: AppTheme.surfaceDark.withValues(alpha: 0.86),
          border: const Border(top: BorderSide(color: AppTheme.border)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
            children: [
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('普通定制', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                  Text('${Money.rmbInt(Pricing.standardTotal)} 起', style: TextStyle(color: AppTheme.goldMain, fontSize: 20, fontWeight: FontWeight.bold, fontFamily: AppTheme.serifFont)),
                  Text('意向金 ${Money.rmbInt(Pricing.intentDeposit)} · 可退可抵', style: TextStyle(color: AppTheme.goldLight.withValues(alpha: 0.85), fontSize: 10.5)),
                ],
              ),
              const SizedBox(width: 16),
              Expanded(
                child: PrimaryButton(
   label: '付意向金 ${Money.rmbInt(Pricing.intentDeposit)} 启动',
   onPressed: () => _showClaimSheet(context),
 ),
              ),
            ],
          ),
          ),
        ),
      ),
    );
  }

  String _statusText(String? s) {
    switch (s) {
      case 'recruiting':
        return '席位认领中';
      case 'success':
        return '已成团';
      case 'preparing':
      case 'producing':
        return '制作中';
      case 'post':
        return '后期制作';
      case 'released':
        return '已交付';
      case 'closed':
        return '已收官';
      default:
        return s ?? '进行中';
    }
  }

  Widget _dataItem(String label, String value, Color color) {
    return Column(
      children: [
        Text(value, style: TextStyle(color: color, fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
      ],
    );
  }

  Widget _buildIntro() {
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 16),
      children: [
        const Text('项目简介', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Text(
          (project['intro'] as String?)?.isNotEmpty == true
              ? project['intro'] as String
              : '这是一部由AI数字人主演的定制剧。用户可在平台免费定制数字人形象、认领角色席位，由专业团队承制，成片后按席位向定制客户交付对应署名、镜头与成片权益。',
          style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14, height: 1.8),
        ),
        const SizedBox(height: 20),
        const Text('主演信息', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        GlassCard(
          padding: const EdgeInsets.all(12),
          radius: 14,
          child: Row(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(colors: [
                    Colors.white.withValues(alpha: 0.20),
                    AppTheme.cyanSoft.withValues(alpha: 0.10),
                    AppTheme.cyanDeep.withValues(alpha: 0.06),
                  ]),
                  border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.4)),
                ),
                child: const Icon(Icons.face_retouching_natural_rounded, color: AppTheme.iceHighlight, size: 20),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(project['protagonist'] as String? ?? '数字人主演', style: const TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.bold)),
                  const Text('数字人主演', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        const Text('AI宣传样片', style: TextStyle(color: AppTheme.goldLight, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          height: 180,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            gradient: LinearGradient(colors: [
              Colors.white.withValues(alpha: 0.05),
              AppTheme.cyanSoft.withValues(alpha: 0.10),
              AppTheme.cyanDeep.withValues(alpha: 0.06),
            ]),
            border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.25)),
          ),
          child: const Center(child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.play_circle_outline_rounded, size: 48, color: AppTheme.iceHighlight),
              SizedBox(height: 8),
              Text('点击播放样片', style: TextStyle(color: AppTheme.textSecondary)),
            ],
          )),
        ),
      ],
    );
  }

  Widget _buildRoles() {
    // 定制档位：彩蛋档低门槛单列；普通定制5000起为走量主推；进阶/电影级一单一议、上不封顶。
    // 全部为内容制作交付，不涉及任何收益分成或货币回报。
    final roles = [
      {'name': '彩蛋档', 'priceText': Money.rmbInt(Pricing.easterEgg), 'tag': '低门槛', 'benefits': ['片尾署名', '专属彩蛋镜头', '数字成片一份', '限量50份'], 'isEaster': true},
      {'name': '普通定制', 'priceText': '${Money.rmbInt(Pricing.standardTotal)} 起', 'tag': '主推', 'benefits': ['选对标类型并定制剧本', '含2轮免费改本', 'AI宣发片3-5个工作日交付', '先付${Pricing.intentDeposit.toInt()}元意向金启动，可退可抵'], 'isMain': true},
      {'name': '进阶定制', 'priceText': '面议', 'tag': '专业团队', 'benefits': ['资深编剧/导演参与', '可做中剧、短剧、网络大电影', '商务一对一，一剧一议'], 'isEaster': false},
      {'name': '电影级定制', 'priceText': '面议', 'tag': '明星参与', 'benefits': ['电影级制作班底', '可邀约明星/专业演员参与', '线下签约，按里程碑交付'], 'isEaster': false},
    ];
    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 16),
      itemCount: roles.length,
      itemBuilder: (_, i) {
        final r = roles[i];
        final isEaster = r['isEaster'] == true;
        final isMain = r['isMain'] == true;
        final highlight = isEaster || isMain;
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: isMain
                ? AppTheme.goldMain.withValues(alpha: 0.12)
                : isEaster
                    ? AppTheme.goldMain.withValues(alpha: 0.06)
                    : Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: highlight ? AppTheme.goldMain : AppTheme.border,
              width: isMain ? 2 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Text(r['name'] as String, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 16, fontWeight: FontWeight.bold, fontFamily: AppTheme.serifFont)),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          gradient: highlight ? AppTheme.brandGradient : null,
                          color: highlight ? null : Colors.white.withValues(alpha: 0.05),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(r['tag'] as String, style: TextStyle(
                          color: highlight ? AppTheme.onGold : AppTheme.textSecondary,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        )),
                      ),
                    ],
                  ),
                  Text(r['priceText'] as String, style: const TextStyle(
                    color: AppTheme.goldMain,
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                    fontFamily: AppTheme.serifFont,
                  )),
                ],
              ),
              if (isEaster) ...[
                const SizedBox(height: 4),
                Text('${Pricing.easterEgg.toInt()}元即可参与定制剧，低门槛圆梦', style: TextStyle(color: AppTheme.goldLight, fontSize: 12)),
              ],
              if (isMain) ...[
                const SizedBox(height: 4),
                Text('流程：选对标剧 → 定制改本 → 定稿确认 → 样片 → 成片', style: TextStyle(color: AppTheme.goldLight.withValues(alpha: 0.9), fontSize: 12)),
              ],
              const SizedBox(height: 8),
              ...((r['benefits'] as List).map((b) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(children: [
                  const Icon(Icons.check_circle, size: 14, color: AppTheme.goldMain),
                  const SizedBox(width: 6),
                  Expanded(child: Text(b as String, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13))),
                ]),
              ))),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDoc(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 16),
      children: [
        _docItem(context, Icons.description, '查看项目计划书', '在线预览',
            onTapOverride: () => Navigator.push(
                context,
                Motion.fadeSlideRoute(
                    ProjectBriefPage(source: project, isProject: true)))),
        _docItem(context, Icons.attach_money, '制作预算明细（示例）.xlsx', '156KB'),
        _docItem(context, Icons.schedule, '制作排期表（示例）.pdf', '890KB'),
        _docItem(context, Icons.people, '主创团队介绍（示例）.pdf', '1.1MB'),
      ],
    );
  }

  Widget _docItem(BuildContext context, IconData icon, String name, String size,
      {VoidCallback? onTapOverride}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GlassCard(
        radius: 12,
        onTap: onTapOverride ??
            () => ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('$name 为示例资料，联网/正式版可在线查看与下载')),
                ),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Icon(icon, color: AppTheme.goldMain),
              const SizedBox(width: 12),
              Expanded(child: Text(name, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 14))),
              Text(size, style: const TextStyle(color: AppTheme.textHint, fontSize: 12)),
              const SizedBox(width: 8),
              const Icon(Icons.download, color: AppTheme.textSecondary, size: 18),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildUpdates() {
    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 16),
      children: [
        GlassCard(
          child: Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: [
                  Colors.white.withValues(alpha: 0.20),
                  AppTheme.cyanSoft.withValues(alpha: 0.10),
                  AppTheme.cyanDeep.withValues(alpha: 0.06),
                ]),
                border: Border.all(color: AppTheme.rimCyan.withValues(alpha: 0.4)),
              ),
              child: const Icon(Icons.campaign_rounded, color: AppTheme.iceHighlight, size: 18),
            ),
            const SizedBox(width: 12),
            const Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('项目上线', style: TextStyle(color: AppTheme.textPrimary, fontSize: 14, fontWeight: FontWeight.w700)),
                SizedBox(height: 2),
                Text('项目正式开放席位认领，欢迎成为主角！', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
              ]),
            ),
            const Text('3天前', style: TextStyle(color: AppTheme.textHint, fontSize: 11)),
          ]),
        ),
      ],
    );
  }

  // 发起普通档定制剧：收集联系人后创建意向金订单并进入 6 步详情页
  Future<void> _startSampleOrder(BuildContext context) async {
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.card,
        title: Text('付意向金 ${Money.rmbInt(Pricing.intentDeposit)} 启动', style: TextStyle(color: AppTheme.goldLight)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: '联系人姓名')),
          const SizedBox(height: 8),
          TextField(controller: phoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: '手机号')),
          const SizedBox(height: 8),
          const Text('意向金由第三方担保托管，成交计入制作总价，未继续可原路退回。',
              style: TextStyle(color: AppTheme.textHint, fontSize: 11)),
        ]),
        actions: [
          PressScale(
            borderRadius: BorderRadius.circular(99),
            onTap: () => Navigator.pop(ctx, false),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
              ),
              child: const Text('取消', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13)),
            ),
          ),
          PressScale(
            borderRadius: BorderRadius.circular(99),
            onTap: () => Navigator.pop(ctx, true),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                gradient: AppTheme.brandGradientHorizontal,
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text('提交并支付意向金', style: TextStyle(color: AppTheme.onGold, fontSize: 13, fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
    if (ok != true) return;
    if (!context.mounted) return;
    if (nameCtrl.text.trim().isEmpty || phoneCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请填写联系人姓名和手机号')));
      return;
    }
    if (_starting) return;
    _starting = true;
    try {
      final order = await ApiService().createSampleOrder(
        contactName: nameCtrl.text.trim(),
        contactPhone: phoneCtrl.text.trim(),
      );
      if (!context.mounted) return;
      final id = (order['id'] as num?)?.toInt() ?? 0;
      Navigator.push(context, Motion.fadeSlideRoute(SampleOrderDetailPage(orderId: id)));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('发起失败：$e')));
    } finally {
      _starting = false;
    }
  }

  void _showClaimSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.card,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('开启你的定制剧', style: TextStyle(color: AppTheme.goldLight, fontSize: 18, fontWeight: FontWeight.bold, fontFamily: AppTheme.serifFont)),
            const SizedBox(height: 16),
            Text('第一步支付${Pricing.intentDeposit.toInt()}元意向金即可启动：选择喜欢的对标类型 → 编剧据此定制并与您沟通改本 → 您确认剧本定稿 → 制作样片与成片。意向金成交时计入制作总价（普通定制${Pricing.standardTotal.toInt()}元起，上不封顶），未继续制作可申请原路退回；成片按剧本审核(20%)/开机(25%)/粗剪审核(25%)/成片交付(30%)四节点里程碑推进，45天未成团全额退款。', style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.6)),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: PrimaryButton(
     label: '支付意向金 ${Money.rmbInt(Pricing.intentDeposit)}',
     onPressed: () { Navigator.pop(context); _startSampleOrder(context); },
   ),
            ),
            const SizedBox(height: 12),
            const Text('本服务为定制内容消费而非投资，不承诺任何货币回报；支持第三方担保支付，不走苹果内购。', style: TextStyle(color: AppTheme.textHint, fontSize: 11), textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
