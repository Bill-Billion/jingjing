import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import '../trade/trade_widgets.dart';

/// Public process information only. Prices and delivery terms come from each
/// original confirmed quote, not a sample product or another user's records.
class ProductionServicePage extends StatelessWidget {
  const ProductionServicePage({super.key});

  // Node 4016:10878 local visual values; shared account theme is unchanged.
  static const _surface = Color(0xFF1C2420);
  static const _text = Color(0xFFF2F5EF);
  static const _muted = Color(0xFFA5AEA8);
  static const _accent = Color(0xFFB9F34A);

  @override
  Widget build(BuildContext context) => _frame(
        context,
        '平台制作服务详情',
        [
          // Shared scaffold supplies 18px; the local 2px gives this page 20px.
          Padding(padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('平台制作 / 由专员对接',
                  style: TextStyle(color: _accent, fontSize: 12, height: 1.5)),
              const SizedBox(height: 20),
              Semantics(header: true, child: const Text('把故事拍成片',
                  style: TextStyle(fontFamily: AccountTheme.sans,
                      color: _text, fontSize: 28, fontWeight: FontWeight.w700,
                      height: 36 / 28))),
              const SizedBox(height: 20),
              ClipRRect(borderRadius: BorderRadius.circular(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Container(
                    height: 180, alignment: Alignment.center,
                    padding: const EdgeInsets.all(16), color: _surface,
                    child: const Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.movie_outlined, size: 36, color: _muted),
                      SizedBox(height: 12),
                      Text('本页尚未提供可播放的服务介绍媒体',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: _muted, fontSize: 12, height: 1.5)),
                    ])),
                  Container(color: _surface, padding: const EdgeInsets.all(14),
                    child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('平台制作服务', style: TextStyle(color: _text,
                          fontSize: 20, fontWeight: FontWeight.w700, height: 1.4)),
                      SizedBox(height: 5),
                      Text('把一个念头，拍成一段完整故事',
                          style: TextStyle(color: _text, fontSize: 12, height: 1.5)),
                    ])),
                ])),
              const SizedBox(height: 20),
              _service('定制片', '从制作需求开始核对本次约定'),
              const SizedBox(height: 8),
              _service('代做样片', '从本人原需求核对专用约定'),
              const SizedBox(height: 8),
              _service('付费精修', '从原制作项目核对追加约定'),
              const SizedBox(height: 20),
              Container(padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: _surface,
                    borderRadius: BorderRadius.circular(16)),
                child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('人工定制报价', style: TextStyle(color: _muted, fontSize: 12, height: 1.5)),
                  SizedBox(height: 6),
                  Text('以本次确认报价为准', style: TextStyle(color: _text,
                      fontSize: 28, height: 34 / 28, fontWeight: FontWeight.w600)),
                  SizedBox(height: 6),
                  Text('具体按已确认方案、交付范围与报价办理。填写或提交需求不会收款，也不表示授权通过或制作开工。',
                      style: TextStyle(color: _muted, fontSize: 12, height: 1.5)),
                  SizedBox(height: 6),
                  Divider(height: 1, color: Color(0xFF34403A)),
                ])),
              const SizedBox(height: 20),
              _section('制作包含什么',
                  '需求梳理、剧本与阵容确认、样片审阅和成片交付。修改范围与次数会写入报价，不从素材一键直接生成交付。'),
              const SizedBox(height: 20),
              const Text('办理流程说明（非本单当前进度）',
                  style: TextStyle(color: _muted, fontSize: 12, height: 1.5)),
              const SizedBox(height: 16),
              _step('1', '提交故事与素材', '由平台客服梳理用途、授权和制作要求'),
              const SizedBox(height: 16),
              _step('2', '确认报价与合同', '确认费用、付款节点及交付标准'),
              const SizedBox(height: 16),
              _step('3', '分阶段审阅', '样片确认、成片验收、付款和下载分别办理'),
              const SizedBox(height: 20),
              Container(padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: const Color(0xFF202C23),
                    borderRadius: BorderRadius.circular(16)),
                child: _section('平台专员全程对接',
                    '制作沟通在平台客服服务单中进行。需要邀请艺人时，由专员协助整理授权与参演约定。具体制作人、进度和办理条件以本单记录为准。',
                    small: true)),
              const SizedBox(height: 20),
              _section('成片与素材归属',
                  '按合同约定使用成片。数字人、原始素材与第三方作品的权利仍由各自权利人持有；制作服务不替代相关授权。'),
              const SizedBox(height: 20),
              _section('已有制作，沿原约定继续',
                  '本人样片从具体需求核对专用约定；新增创作要求从原项目提出，另行确认追加报价。这里不直接购买样片或精修，也不改写原订单。'),
              const SizedBox(height: 14),
              tradeButton('查看我的制作',
                  () => Navigator.pushNamed(context, '/production'), outline: true),
            ])),
        ],
        footer: Padding(padding: const EdgeInsets.symmetric(horizontal: 2),
          child: LayoutBuilder(builder: (context, constraints) {
            final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
            final help = OutlinedButton(
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 48), foregroundColor: _accent,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
                    side: const BorderSide(color: _accent), shape: shape,
                    textStyle: const TextStyle(fontFamily: AccountTheme.sans,
                        fontSize: 14, fontWeight: FontWeight.w500, height: 20 / 14)),
                onPressed: () => Navigator.pushNamed(context, '/help'),
                child: const Text('平台帮助与反馈'));
            final create = FilledButton(
                style: FilledButton.styleFrom(
                    minimumSize: const Size(0, 48), backgroundColor: _accent,
                    foregroundColor: const Color(0xFF101513), shape: shape,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    textStyle: const TextStyle(fontFamily: AccountTheme.sans,
                        fontSize: 14, fontWeight: FontWeight.w500, height: 20 / 14)),
                onPressed: () => Navigator.pushNamed(context, '/customization/new'),
                child: const Text('填写制作需求'));
            if (constraints.maxWidth < 330 ||
                MediaQuery.textScalerOf(context).scale(14) > 18) {
              return Column(mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [help, const SizedBox(height: 8), create]);
            }
            return Row(children: [Expanded(flex: 138, child: help),
                const SizedBox(width: 10), Expanded(flex: 202, child: create)]);
          })),
        onBack: () => Navigator.canPop(context)
            ? Navigator.pop(context)
            : Navigator.pushReplacementNamed(context, '/square'),
      );


  // A page-local shell is required: tradeScaffold installs AccountTheme below
  // an outer Theme, so an outer override alone cannot change its canvas.
  Widget _frame(BuildContext context, String title, List<Widget> children,
      {required Widget footer, required VoidCallback onBack}) {
    const canvas = Color(0xFF101513);
    final theme = AccountTheme.data.copyWith(
        scaffoldBackgroundColor: canvas,
        colorScheme: AccountTheme.data.colorScheme.copyWith(
            primary: _accent, onPrimary: canvas, surface: _surface,
            onSurface: _text, outline: const Color(0xFF34403A)),
        appBarTheme: AccountTheme.data.appBarTheme.copyWith(
            backgroundColor: canvas, foregroundColor: _text,
            surfaceTintColor: Colors.transparent,
            titleTextStyle: const TextStyle(fontFamily: AccountTheme.sans,
                color: _text, fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w500)));
    return Theme(data: theme, child: Scaffold(
      appBar: AppBar(toolbarHeight: 52, title: Text(title),
          leading: BackButton(onPressed: onBack)),
      body: SafeArea(child: Center(child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: ListView(padding: const EdgeInsets.fromLTRB(18, 20, 18, 24),
              children: children)))),
      bottomNavigationBar: ColoredBox(color: canvas,
          child: SafeArea(top: false, child: Center(heightFactor: 1,
              child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 560),
                  child: Padding(padding: const EdgeInsets.fromLTRB(18, 8, 18, 10),
                      child: SizedBox(width: double.infinity, child: footer)))))),
    ));
  }

  Widget _section(String title, String body, {bool small = false}) =>
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(color: _text,
            fontSize: 14, fontWeight: FontWeight.w500, height: 20 / 14)),
        const SizedBox(height: 8),
        Text(body, style: TextStyle(color: small ? _text : _muted,
            fontSize: small ? 12 : 14, height: small ? 1.5 : 22 / 14)),
      ]);

  // These are service descriptions, not selectable SKUs or a default choice.
  Widget _service(String title, String body) => Container(
      constraints: const BoxConstraints(minHeight: 46),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: _surface, borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(color: _text,
            fontSize: 14, fontWeight: FontWeight.w500, height: 20 / 14)),
        const SizedBox(height: 4),
        Text(body, style: const TextStyle(color: _muted, fontSize: 12, height: 1.5)),
      ]));

  Widget _step(String number, String title, String body) =>
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(width: 22, height: 22, alignment: Alignment.center,
            decoration: BoxDecoration(color: _surface,
                borderRadius: BorderRadius.circular(12)),
            child: Text(number, style: const TextStyle(fontSize: 12, color: _muted))),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(color: _text,
              fontSize: 14, fontWeight: FontWeight.w500, height: 20 / 14)),
          const SizedBox(height: 3),
          Text(body, style: const TextStyle(color: _muted, fontSize: 12, height: 1.5)),
        ])),
      ]);
}
