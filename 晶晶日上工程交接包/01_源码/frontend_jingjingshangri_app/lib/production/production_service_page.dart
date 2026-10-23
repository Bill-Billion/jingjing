import 'package:flutter/material.dart';
import '../account/account_theme.dart';
import '../trade/trade_widgets.dart';

/// Public process information only. Prices and delivery terms come from each
/// original confirmed quote, not a sample product or another user's records.
class ProductionServicePage extends StatelessWidget {
  const ProductionServicePage({super.key});

  @override
  Widget build(BuildContext context) => tradeScaffold(
        context,
        '平台制作服务详情',
        [
          const Text('平台制作 / 从本人的故事开始',
              style: TextStyle(color: AccountTheme.accent, fontSize: 12)),
          const SizedBox(height: 22),
          Semantics(
              header: true,
              child: const Text('把故事拍成片',
                  style: TextStyle(
                      fontFamily: AccountTheme.serif,
                      fontSize: 42,
                      fontWeight: FontWeight.w900,
                      height: 1.15))),
          const SizedBox(height: 24),
          AspectRatio(
              aspectRatio: 5 / 3,
              child: Image.asset('assets/images/editorial-rain.webp',
                  fit: BoxFit.cover, semanticLabel: '巷景视觉示意，不代表在售作品或制作结果')),
          const ColoredBox(
              color: AccountTheme.text,
              child: Padding(
                  padding: EdgeInsets.all(18),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('从一个念头开始',
                            style: TextStyle(
                                color: AccountTheme.canvas,
                                fontSize: 22,
                                fontWeight: FontWeight.w700)),
                        SizedBox(height: 6),
                        Text('制作氛围视觉示意，非已成交作品',
                            style: TextStyle(color: AccountTheme.canvas)),
                      ]))),
          const SizedBox(height: 20),
          _service('定制片', '从制作需求开始核对本次约定', selected: true),
          _service('代做样片', '须从本人原需求核对专用约定'),
          _service('付费精修', '须从原制作项目核对追加约定'),
          const SizedBox(height: 16),
          tradeBanner(
              '定制制作 · 先确认本次报价', '规格、金额与付款节点以原确认报价为准。填写或提交需求不会收款，也不表示授权通过或制作开工。',
              icon: Icons.description_outlined),
          tradeSection('本次制作的约定', [
            const Text('先说明故事、用途与制作要求。片长、交付内容、修改范围和次数会写入本次报价与合同。'),
          ]),
          tradeSection('制作包含什么', [
            const Text('从需求梳理、剧本与阵容确认，到按当前版本审阅和成片交付，沿同一需求与原订单办理。'),
            const SizedBox(height: 20),
            _step('1', '填写制作需求', '按品类说明故事、真实用途和授权情况，提交后查看平台受理进度。'),
            _step('2', '确认报价与合同', '核对规格、费用、付款节点和交付标准；订单、付款与签署分别确认。'),
            _step('3', '分阶段审阅与交付', '核对当前具体版本，按原约定办理预览、修改、验收、后续付款与下载。'),
          ]),
          tradeSection('已有制作，沿原约定继续', [
            const Text(
                '本人样片需从具体需求核对专用约定；新增创作要求从原制作项目提出，另行核对追加报价。这里不直接购买样片或精修，也不改写原订单。'),
            const SizedBox(height: 14),
            tradeButton(
                '查看我的制作', () => Navigator.pushNamed(context, '/production'),
                outline: true),
          ]),
          tradeSection('成片与素材归属', [
            const Text('按原合同约定使用成片。数字人、原始素材与第三方作品的权利仍由各自权利人持有；制作服务不替代相关授权。'),
          ]),
        ],
        footer: FilledButton(
            onPressed: () => Navigator.pushNamed(context, '/customization/new'),
            child: const Text('填写制作需求')),
        onBack: () => Navigator.canPop(context)
            ? Navigator.pop(context)
            : Navigator.pushReplacementNamed(context, '/square'),
      );

  Widget _service(String title, String body, {bool selected = false}) =>
      Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(16),
          color: selected ? AccountTheme.text : const Color(0xFFE7E4DA),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(selected ? Icons.check : Icons.add,
                color: selected ? AccountTheme.canvas : AccountTheme.muted),
            const SizedBox(width: 12),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(title,
                      style: TextStyle(
                          color: selected
                              ? AccountTheme.canvas
                              : AccountTheme.text,
                          fontSize: 18,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text(body,
                      style: TextStyle(
                          color: selected
                              ? AccountTheme.canvas
                              : AccountTheme.muted)),
                ])),
          ]));

  Widget _step(String number, String title, String body) => Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
            width: 24,
            height: 24,
            color: number == '1' ? AccountTheme.vermilion : AccountTheme.border,
            alignment: Alignment.center,
            child: Text(number,
                style: TextStyle(
                    fontSize: 12,
                    color: number == '1'
                        ? AccountTheme.canvas
                        : AccountTheme.text))),
        const SizedBox(width: 12),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title,
              style:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(body,
              style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
        ])),
      ]));
}
