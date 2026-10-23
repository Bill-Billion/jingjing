import 'package:flutter/material.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../account/editorial_widgets.dart';
import '../engagement/community_support.dart';
import '../engagement/engagement_pages.dart' show validateBuyers;
import '../trade/trade_widgets.dart';

enum DiscoveryKind { artists, videos, notices }

String discoveryDirectoryRoute(DiscoveryKind kind,
    {String city = '', String tag = ''}) {
  final query = <String, String>{
    if (city.trim().isNotEmpty) 'city': city.trim(),
    if (kind == DiscoveryKind.artists && tag.trim().isNotEmpty)
      'tag': tag.trim(),
  };
  return Uri(
          path: switch (kind) {
            DiscoveryKind.artists => '/artists/catalog',
            DiscoveryKind.videos => '/stock/catalog',
            DiscoveryKind.notices => '/notices/catalog',
          },
          queryParameters: query.isEmpty ? null : query)
      .toString();
}

/// Only the supported directory filters are collected. The design's free-text
/// matching percentages require a search service and must not be fabricated.
class DiscoverySearchPage extends StatefulWidget {
  const DiscoverySearchPage({super.key, this.initialCity = ''});
  final String initialCity;
  @override
  State<DiscoverySearchPage> createState() => _DiscoverySearchPageState();
}

class _DiscoverySearchPageState extends State<DiscoverySearchPage> {
  late final city = TextEditingController(text: widget.initialCity);
  final tag = TextEditingController();
  DiscoveryKind kind = DiscoveryKind.artists;
  @override
  void dispose() {
    city.dispose();
    tag.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '搜索与匹配', [
        tradeHeading('找一张合适的脸', eyebrow: '从公开目录开始寻找'),
        TextField(
            key: const ValueKey('discovery-city'),
            controller: city,
            maxLength: 100,
            decoration: const InputDecoration(
                labelText: '城市', hintText: '填写城市，留空查看目录全部城市')),
        const SizedBox(height: 16),
        Row(children: [
          for (final option in [
            (DiscoveryKind.artists, '艺人'),
            (DiscoveryKind.videos, '视频'),
            (DiscoveryKind.notices, '通告')
          ])
            Expanded(
                child: Semantics(
                    selected: kind == option.$1,
                    child: TextButton(
                        onPressed: () => setState(() => kind = option.$1),
                        style: TextButton.styleFrom(
                            foregroundColor: kind == option.$1
                                ? AccountTheme.text
                                : AccountTheme.muted,
                            shape: const RoundedRectangleBorder()),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          Text(option.$2),
                          const SizedBox(height: 8),
                          Container(
                              width: 28,
                              height: 2,
                              color: kind == option.$1
                                  ? AccountTheme.vermilion
                                  : Colors.transparent),
                        ]))))
        ]),
        const SizedBox(height: 24),
        if (kind == DiscoveryKind.artists)
          TextField(
              key: const ValueKey('discovery-tag'),
              controller: tag,
              maxLength: 40,
              decoration: const InputDecoration(
                  labelText: '艺人标签', hintText: '例如：都市；留空不限制标签')),
        tradeSection('目录查找说明', [
          const Text('按城市及已公开标签进入对应目录，具体可用内容以重新读取的目录为准。',
              style: TextStyle(color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 12),
          const Text('角色描述智能匹配尚未开放，当前不计算匹配率。'),
          const SizedBox(height: 12),
          const FilledButton(onPressed: null, child: Text('智能匹配尚未开放')),
        ]),
        const SizedBox(height: 12),
        tradeButton('清空条件', () {
          setState(() {
            city.clear();
            tag.clear();
            kind = DiscoveryKind.artists;
          });
        }, outline: true),
        tradeButton('查看所选目录', () {
          Navigator.pushNamed(context,
              discoveryDirectoryRoute(kind, city: city.text, tag: tag.text));
        })
      ]);
}

Map<String, dynamic>? currentPublicBuyer(
    Map<String, dynamic> snapshot, String city, String partyId) {
  validateBuyers(snapshot);
  communityRequire(snapshot['city'] == city.trim());
  final matches = [
    ...communityRows(snapshot['personal']),
    ...communityRows(snapshot['organizations'])
  ].where((r) => r['party_id'] == partyId).toList();
  communityRequire(matches.length <= 1);
  return matches.isEmpty ? null : matches.single;
}

/// The buyers endpoint intentionally publishes IDs and verified facts, without
/// names or portraits. Never supplement them from a private party API.
class PublicProducerPage extends StatelessWidget {
  const PublicProducerPage(
      {super.key, required this.partyId, required this.city});
  final String partyId, city;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'engagement',
      partyRequired: false,
      route: Uri(path: '/producers/public', queryParameters: {
        'partyId': partyId,
        'city': city,
      }).toString(),
      title: '出品人和机构主页',
      builder: (session) => _PublicProducer(
          session: session, partyId: partyId, city: city.trim()));
}

class _PublicProducer extends StatefulWidget {
  const _PublicProducer(
      {required this.session, required this.partyId, required this.city});
  final AccountSession session;
  final String partyId, city;
  @override
  State<_PublicProducer> createState() => _PublicProducerState();
}

class _PublicProducerState extends State<_PublicProducer> {
  Map<String, dynamic>? buyer;
  bool busy = false;
  String? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    if (busy) return;
    setState(() {
      busy = true;
      buyer = null;
      error = null;
    });
    try {
      communityRequiredId(widget.partyId, '公开主体');
      communityRequired(widget.city, '原名单城市', max: 100);
      final snapshot = await CommunityApi(widget.session, 'engagement')
          .read('buyers', account: true, query: {'city': widget.city});
      final current = currentPublicBuyer(snapshot, widget.city, widget.partyId);
      if (!mounted) return;
      setState(() {
        buyer = current;
        if (current == null) error = '该主体目前不在这个城市的公开名单中。';
      });
    } catch (e) {
      if (mounted) setState(() => error = communityError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = buyer;
    return tradeScaffold(context, '出品人和机构主页', [
      if (busy) const LinearProgressIndicator(),
      if (current == null) ...[
        tradeHeading('先核对公开范围', eyebrow: '出品方档案 / 当前公开名单'),
        Text(error ?? '正在核对该主体的当前公开选择。'),
        const SizedBox(height: 24),
      ] else ...[
        EditorialFeature(
            title: current['party_kind'] == 'PERSON' ? '出品人' : '机构',
            eyebrow: '出品方档案 / ${widget.city}',
            description: '已公开主体 ${communityShort(current['party_id'])}',
            imageLabel: '未提供公开肖像或封面'),
        tradeFact('公开主体编号', current['party_id']),
        tradeSection('已核实的业务记录', [
          tradeFact(
              '完成订单',
              current['facts_available'] == true
                  ? current['completed_orders']
                  : '核算依据尚未配置'),
          tradeFact(
              '核实净付款',
              current['facts_available'] == true
                  ? communityMoney(current['verified_net_paid_minor'])
                  : '核算依据尚未配置'),
          if (current['party_kind'] == 'PERSON') ...[
            tradeFact('消费成长', current['consumption_growth']),
            tradeFact(
                '星探资格',
                current['scout_active'] == true
                    ? '当前有效 · 第${current['scout_level']}级'
                    : '当前未生效'),
          ],
          tradeFact(
              '合规记录', current['compliance_clear'] == true ? '当前已核对' : '有记录需复核'),
        ]),
        tradeSection('公开作品与通告', [
          const Text('公开名单尚未提供姓名、肖像、作品清单或该主体的在架通告，当前无法展示这些内容。',
              style: TextStyle(color: AccountTheme.muted, height: 1.6)),
          const SizedBox(height: 16),
          const FilledButton(onPressed: null, child: Text('针对该主体的投稿暂未开放')),
        ]),
      ],
      tradeButton('重新核对公开名单', busy ? null : load, outline: true),
      tradeButton(
          '查看全站通告',
          () => Navigator.pushNamed(
              context,
              discoveryDirectoryRoute(DiscoveryKind.notices,
                  city: widget.city)),
          outline: true),
    ]);
  }
}
