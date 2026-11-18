import 'package:flutter/material.dart';
import 'rights_models.dart';

class CopyrightFacts extends StatelessWidget {
  const CopyrightFacts({super.key, this.terms, this.snapshot});
  final Map<String, dynamic>? terms, snapshot;
  @override
  Widget build(BuildContext context) {
    final t = terms ?? snapshot?['terms'], l = t?['license'];
    return Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('本次成片版权与使用范围', style: Theme.of(context).textTheme.titleMedium),
          if (t == null)
            const Text('按原合同约定。历史记录没有新版版权字段，不能推算归属或扩展用途。')
          else ...[
            Text(copyrightModes[t['mode']] ?? '按原合同核对'),
            Text(t['buyout_price_included'] == true
                ? '价款包含成片版权转让'
                : '价款不包含版权买断'),
            if (l is Map) ...[
              Text(
                  '${l['scope'] == 'PERSONAL_NONCOMMERCIAL' ? '个人非商用' : '明确约定范围'} · ${(l['purposes'] as List).map((p) => copyrightPurposes[p]).join('、')}'),
              Text(
                  '地域：${(l['territories'] as List).join('、')}；永久、非独家、不可转让、不可再许可'),
              SelectableText(l['terms_text']),
            ],
            const Text('肖像、声音等人格权仍归本人，底层资产及第三方音乐字体权利不随本交易转让。个人许可不能用于商业发行。'),
            if (snapshot != null) ...[
              SelectableText('成片版权人：${snapshot!['copyright_owner_party_id']}'),
              if (snapshot!['licensee_party_id'] != null)
                SelectableText('本单获准使用人：${snapshot!['licensee_party_id']}'),
              SelectableText(
                  '人格权人：${snapshot!['personality_rights_owner_party_id'] ?? '后续出镜人员须逐人授权，未转让人格权'}'),
            ]
          ]
        ]));
  }
}

List<Widget> stockRightsFacts(Map<String, dynamic> l) => [
      Text(l['scope'] == 'COMMERCIAL_LIMITED'
          ? '独立商用许可 · 非独家 · 仅限本单买受人'
          : '个人非商用许可 · 全球 · 永久 · 非独家'),
      if (l['scope'] == 'COMMERCIAL_LIMITED') ...[
        Text(
            '获准用途：${(l['commercial_uses'] as List).map((u) => commercialUses[u]).join('、')}'),
        Text('地域：${l['territory']}'),
        Text('有效期：${l['valid_from']} 至 ${l['valid_until']}（UTC）'),
        const Text('不包含转售、再许可、改编、发行、声音单独使用、重新生成、源文件或版权买断；商业广告仅在获准用途明确列出时允许。'),
      ] else
        const Text('允许本人收藏和个人社交分享；不包含商业广告、改编、发行、训练、源文件或买断。'),
      Text(
          '${l['acceptance_policy'] == 'CONTRACT_20261029' ? '本单从下单起核对期限，未付款、未交付或争议时不得自动结算' : '本单明确收讫后的验收期限'}：${l['acceptance_hours']} 小时'),
      Text('售后约定：${l['aftercare_terms']}'),
      const Text('原购买保留当时约定。停止新售不改写历史许可；付款、许可生效、允许下载分别核对。'),
    ];
