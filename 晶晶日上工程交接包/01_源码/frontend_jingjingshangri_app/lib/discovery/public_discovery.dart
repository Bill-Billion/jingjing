import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../artists/artists_api.dart';
import '../artists/artists_pages.dart' show openArtistPublicDetails;
import '../auditions/auditions_models.dart';
import '../engagement/community_support.dart';
import '../notices/notices_api.dart';
import '../notices/notices_models.dart';
import '../stock/stock_models.dart';
import '../trade/trade_widgets.dart';

const matchReasons = {
  'PUBLIC_AVAILABLE': '当前公开且可用',
  'CITY_MATCH': '符合所选城市',
  'TEXT_MATCH': '公开介绍符合关键词',
  'LICENSE_MATCH': '许可范围符合用途',
  'COMMERCIAL_USE_MATCH': '包含所选商用用途',
  'PUBLIC_PRICE_WITHIN_BUDGET': '公开价格在预算内',
  'HALO_THRESHOLD_MET': '达到所选星环等级',
  'TAG_MATCH': '包含所选标签',
  'AUDITION_MODE_MATCH': '符合试镜方式',
  'NOTICE_TYPE_MATCH': '符合通告类型'
};
const rankingReasons = {
  'PUBLIC_CATALOG': '公开目录顺序',
  'RECENT_BROWSING_CITY': '与你近期浏览的公开内容城市相关',
  'RECENT_PURCHASE_CITY': '与你近期实际购买的公开内容城市相关',
};
const discoveryReasons = {...matchReasons, ...rankingReasons};

void validateDiscoveryRanking(Map<String, dynamic> d, {required bool matching}) {
  communityRequire(d['personalized'] is bool &&
      d['price_personalized'] == false &&
      d['candidate_limit'] == 500 && d['catalog_truncated'] is bool &&
      d['algorithm_version'] == (matching
          ? 'EXPLICIT_FILTERS_CITY_ACTIVITY_V1' : 'CITY_ACTIVITY_V1'));
  final principle = d['personalized'] == true
      ? 'RECENT_PURCHASE_CITY_THEN_BROWSING_CITY_THEN_CATALOG'
      : 'PUBLIC_CATALOG_ORDER';
  communityRequire(d['principle'] == '${matching ? 'EXPLICIT_FILTERS_THEN_' : ''}$principle');
  if (matching) communityRequire(d['requires_business_validation'] == true);
  for (final row in communityItems(d)) {
    final why = row['reasons'];
    communityRequire(why is List && why.isNotEmpty &&
        why.every((v) => (matching ? discoveryReasons : rankingReasons).containsKey(v)) &&
        why.where(rankingReasons.containsKey).length == 1 &&
        (d['personalized'] == true || why.contains('PUBLIC_CATALOG')));
  }
}
const discoveryKinds = {
  'ARTIST': '艺人',
  'STOCK': '作品',
  'AUDITION': '试镜',
  'NOTICE': '通告'
};

String publicDirectoryError(Object error) {
  if (error is AccountError &&
      [
        'DIRECTORY_NOT_FOUND',
        'DIRECTORY_NOT_OPEN',
        'DIRECTORY_CAPABILITY_INACTIVE',
        'PARTY_NOT_ACTIVE'
      ].contains(error.code)) {
    return '这份机构公开资料已撤回或暂不可查看，请返回目录刷新。';
  }
  if (error is AccountError && error.code == 'DIRECTORY_COVER_NOT_FOUND') {
    return '机构主图已撤回或暂不可查看，请刷新公开资料。';
  }
  return communityError(error);
}

String publicContentRoute(String kind, String id) {
  communityRequiredId(id, '公开内容');
  return switch (kind) {
    'STOCK' => '/stock/video?listingId=$id',
    'NOTICE' => '/notices/public?noticeId=$id',
    'AUDITION' => '/auditions/book?offerId=$id',
    'ARTIST' => '/artists/public?listingId=$id',
    _ => throw const AccountError(400, 'INVALID_KIND'),
  };
}

List<Map<String, dynamic>> validatePublicPage(Map<String, dynamic> d,
    {String? previous}) {
  final rows = communityItems(d);
  communityRequire(rows.length <= 100 &&
      (d['next_cursor'] == null ||
          d['next_cursor'] is String &&
              (d['next_cursor'] as String).isNotEmpty &&
              d['next_cursor'] != previous));
  return rows;
}

Future<List<Map<String, dynamic>>> readQuickCities(AccountSession s) async {
  final d = await CommunityApi(s, 'discovery').read('cities', account: true);
  communityRequire(d['scope'] == 'QUICK_CHOICES' &&
      d['allows_custom_city'] == true &&
      d['revision'] is String);
  final rows = communityItems(d);
  communityRequire(rows.every((r) =>
      r['code'] is String && r['name'] is String && r['aliases'] is List));
  return rows;
}

class PublicArtistPage extends StatelessWidget {
  const PublicArtistPage({super.key, required this.listingId});
  final String listingId;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'discovery',
      partyRequired: false,
      route: '/artists/public?listingId=$listingId',
      title: '艺人公开资料',
      builder: (s) => _ArtistEntry(session: s, id: listingId));
}

class _ArtistEntry extends StatefulWidget {
  const _ArtistEntry({required this.session, required this.id});
  final AccountSession session;
  final String id;
  @override
  State<_ArtistEntry> createState() => _ArtistEntryState();
}

class _ArtistEntryState extends State<_ArtistEntry> {
  String? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => open());
  }

  Future<void> open() async {
    try {
      final r = await ArtistsApi(widget.session).publicDetail(widget.id);
      if (!mounted) return;
      await openArtistPublicDetails(context,
          session: widget.session, listing: r);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => error = communityError(e));
    }
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '艺人公开资料', [
        if (error == null) const LinearProgressIndicator() else Text(error!),
        if (error != null) tradeButton('重新读取公开资料', open),
      ]);
}

class PublicSearchPage extends StatelessWidget {
  const PublicSearchPage({super.key, this.initialCity = ''});
  final String initialCity;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'discovery',
      partyRequired: false,
      route: '/search',
      title: '查找公开内容',
      builder: (s) => _PublicSearch(session: s, initialCity: initialCity));
}

class _PublicSearch extends StatefulWidget {
  const _PublicSearch({required this.session, required this.initialCity});
  final AccountSession session;
  final String initialCity;
  @override
  State<_PublicSearch> createState() => _PublicSearchState();
}

class _PublicSearchState extends State<_PublicSearch> {
  late final city = TextEditingController(text: widget.initialCity);
  final query = TextEditingController(),
      budget = TextEditingController(),
      tag = TextEditingController();
  bool matching = false, activeMatching = false;
  bool recommended = false, activeRecommended = false;
  Map<String, dynamic>? ranking;
  String purpose = '',
      commercialUse = '',
      halo = '',
      auditionMode = '',
      noticeType = '';
  Map<String, dynamic> activeFilters = {};
  final reasons = <String, List<String>>{};
  Map<String, dynamic> filters() {
    final f = <String, dynamic>{};
    if (!matching) return f;
    if (kind == 'ARTIST') {
      if (halo.isNotEmpty) f['min_halo'] = int.parse(halo);
      if (tag.text.trim().isNotEmpty) f['tag'] = tag.text.trim();
    }
    if (kind == 'STOCK') {
      if (purpose.isNotEmpty) f['purpose'] = purpose;
      if (purpose == 'COMMERCIAL_LIMITED' && commercialUse.isNotEmpty) {
        f['commercial_use'] = commercialUse;
      }
    }
    if (['STOCK', 'AUDITION'].contains(kind) && budget.text.trim().isNotEmpty) {
      final n = communityMinor(budget.text, '最高公开价格', zero: true);
      communityRequire(n <= 900000000000);
      f['max_price_minor'] = n;
    }
    if (kind == 'AUDITION' && auditionMode.isNotEmpty) {
      f['audition_mode'] = auditionMode;
    }
    if (kind == 'NOTICE' && noticeType.isNotEmpty) {
      f['notice_type'] = noticeType;
    }
    return f;
  }

  String kind = 'ARTIST',
      activeKind = 'ARTIST',
      activeCity = '',
      activeQuery = '';
  String? cursor, error, cityError;
  List<Map<String, dynamic>> rows = [], cities = [];
  final seen = <String>{};
  bool busy = false;
  int ticket = 0;
  @override
  void initState() {
    super.initState();
    loadCities();
    load();
  }

  Future<void> loadCities() async {
    try {
      final r = await readQuickCities(widget.session);
      if (mounted) {
        setState(() {
          cities = r;
          cityError = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => cityError = communityError(e));
    }
  }

  void clearResults() {
    ticket++;
    rows = [];
    reasons.clear();
    ranking = null;
    cursor = null;
    seen.clear();
    busy = false;
    error = null;
  }

  Future<void> load({bool more = false}) async {
    if (more && (busy || cursor == null)) return;
    if (!more) {
      try {
        activeFilters = filters();
        activeMatching = matching;
        activeRecommended = recommended;
      } catch (e) {
        setState(() => error = communityError(e));
        return;
      }
    }
    if (!more) {
      clearResults();
      activeKind = kind;
      activeCity = city.text.trim();
      activeQuery = query.text.trim();
    }
    final t = ++ticket, previous = more ? cursor : null;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final endpoint = activeRecommended
          ? (activeMatching ? 'recommended-matches' : 'recommendations')
          : (activeMatching ? 'matches' : 'search');
      final d = await CommunityApi(widget.session, 'discovery')
          .read(endpoint, account: true, query: {
        ...activeFilters,
        'kind': activeKind,
        'limit': 20,
        if (activeCity.isNotEmpty) 'city': activeCity,
        if (activeQuery.isNotEmpty) 'q': activeQuery,
        if (previous != null) 'cursor': previous,
      });
      final raw = validatePublicPage(d, previous: previous);
      if (activeRecommended) validateDiscoveryRanking(d, matching: activeMatching);
      if (activeMatching && !activeRecommended) {
        communityRequire(d['algorithm_version'] ==
                'EXPLICIT_BUSINESS_FILTERS_V1' &&
            d['personalized'] == false &&
            d['price_personalized'] == false &&
            d['requires_business_validation'] == true &&
            d['principle'] == 'EXPLICIT_FILTERS_THEN_PUBLIC_CATALOG_ORDER' &&
            d['scan_limited'] is bool);
      }
      if (activeMatching) {
        final f = communityMap(d['filters']);
        communityRequire(f.length == activeFilters.length &&
            activeFilters.entries.every((e) =>
                e.key == 'tag' ? f[e.key] is String : f[e.key] == e.value));
        for (final r in raw) {
          communityRequire(r['reasons'] is List &&
              (r['reasons'] as List).isNotEmpty &&
              (r['reasons'] as List).every((v) => (activeRecommended ? discoveryReasons : matchReasons).containsKey(v)));
          communityMap(r['item']);
        }
      }
      final result = activeMatching || activeRecommended
          ? raw.map((r) => communityMap(r['item'])).toList()
          : raw;
      communityRequire(d['kind'] == activeKind);
      for (final r in result) {
        switch (activeKind) {
          case 'STOCK':
            StockOffer(r);
          case 'NOTICE':
            NoticePublic(r);
          case 'AUDITION':
            AuditionOffer(r);
          case 'ARTIST':
            communityRequire(communityId(r['listing_id']) &&
                r['display_name'] is String &&
                r['city'] is String);
        }
      }
      if (!mounted || t != ticket) return;
      final next = d['next_cursor'] as String?;
      communityRequire(next == null || seen.add(next));
      setState(() {
        if (activeMatching || activeRecommended) {
          for (final r in raw) {
            final item = communityMap(r['item']);
            reasons[(item['listing_id'] ?? item['id']) as String] =
                List<String>.from(r['reasons']);
          }
        }
        rows = [...rows, ...result];
        cursor = next;
        ranking = activeRecommended ? {
          'personalized': d['personalized'],
          'catalog_truncated': d['catalog_truncated'],
        } : null;
      });
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          error = communityError(e);
          if (e is AccountError &&
              [400, 401, 403, 404, 409, 412].contains(e.status)) {
            rows = [];
            cursor = null;
            reasons.clear();
            ranking = null;
          }
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    ticket++;
    city.dispose();
    query.dispose();
    budget.dispose();
    tag.dispose();
    super.dispose();
  }

  Widget result(Map<String, dynamic> r) {
    final data = activeKind == 'NOTICE' ? communityMap(r['notice']) : r;
    final id = (activeKind == 'ARTIST' ? r['listing_id'] : r['id']) as String;
    final title = data['display_name'] ?? data['title'] ?? '试镜方案';
    final cityLabel = data['city'] is String ? (data['city'] as String).trim() : '';
    final metadata = [discoveryKinds[activeKind]!, if (cityLabel.isNotEmpty) cityLabel].join(' · ');
    return Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: const BoxDecoration(border: Border(
            bottom: BorderSide(color: AccountTheme.border))),
        child: LayoutBuilder(builder: (context, constraints) {
          final details = Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('$title', style: const TextStyle(fontSize: 18,
                fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(metadata,
                style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
            if (activeMatching || activeRecommended) ...[
              const SizedBox(height: 6),
              Text('${activeRecommended ? '排序依据' : '符合所选条件'}：${(reasons[id] ?? []).map((r) => discoveryReasons[r]).join('、')}',
                  style: const TextStyle(fontSize: 12, color: AccountTheme.accent)),
            ],
            if (activeKind == 'AUDITION' || activeKind == 'STOCK') ...[
              const SizedBox(height: 6),
              Text(r['unit_minor'] == null ? '价格未公开'
                  : '${activeKind == 'STOCK' ? '本版许可' : '服务费用'} · ${communityMoney(r['unit_minor'])}',
                  style: const TextStyle(fontSize: 14)),
            ],
            if (data['introduction'] is String || data['description'] is String) ...[
              const SizedBox(height: 8),
              Text('${data['introduction'] ?? data['description']}',
                  maxLines: 3, overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12, height: 1.5,
                      color: AccountTheme.muted)),
            ],
          ]);
          final action = OutlinedButton(
              onPressed: busy ? null : () async {
                await Navigator.pushNamed(context, publicContentRoute(activeKind, id));
                if (mounted) await load();
              },
              child: Text(activeKind == 'ARTIST' ? '查看资料'
                  : '查看${discoveryKinds[activeKind]}'));
          if (constraints.maxWidth < 340 ||
              MediaQuery.textScalerOf(context).scale(14) > 20) {
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [details, const SizedBox(height: 12), action]);
          }
          return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: details), const SizedBox(width: 16),
            SizedBox(width: 104, child: action),
          ]);
        }));
  }

  void chooseKind(String value) {
    if (busy || value == kind) return;
    setState(() {
      kind = value;
      purpose = '';
      commercialUse = '';
      halo = '';
      auditionMode = '';
      noticeType = '';
      budget.clear();
      tag.clear();
      clearResults();
    });
    load();
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '查找公开内容', [
        tradeHeading('找一张合适的脸', eyebrow: '从角色找到合适的人', fontSize: 28),
        const SizedBox(height: 16),
        TextField(
            controller: query,
            maxLength: 100,
            minLines: 1,
            maxLines: 3,
            decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                labelText: '关键词或需求片段',
                hintText: '如：悬疑女主、雨巷年轻记者',
                helperText: '按公开名称、介绍等字段作字面查找，不自动理解剧情或拆解需求',
                helperMaxLines: 3),
            onChanged: (_) => setState(clearResults),
            onSubmitted: (_) => load()),
        const SizedBox(height: 8),
        TextField(
            controller: city,
            maxLength: 100,
            decoration: const InputDecoration(
                labelText: '城市', hintText: '如：上海；留空查看全部城市'),
            onChanged: (_) => setState(clearResults)),
        Wrap(spacing: 8, children: [
          for (final c in cities)
            TextButton(
                onPressed: () {
                  setState(() {
                    city.text = c['name'];
                    clearResults();
                  });
                  load();
                },
                child: Text(c['name']))
        ]),
        if (cityError != null) ...[
          Text('快捷城市读取失败，仍可手动输入。$cityError'),
          tradeButton('重读快捷城市', loadCities, outline: true)
        ],
        const SizedBox(height: 12),
        Row(children: [
          for (final item in const <String, String>{
            'ARTIST': '艺人', 'STOCK': '视频', 'NOTICE': '通告',
          }.entries)
            Expanded(child: Container(
                decoration: BoxDecoration(border: Border(bottom: BorderSide(
                    color: kind == item.key ? AccountTheme.accent : Colors.transparent,
                    width: 2))),
                child: TextButton(onPressed: busy ? null : () => chooseKind(item.key),
                    child: Text(item.value, style: TextStyle(
                        color: kind == item.key ? AccountTheme.accent : AccountTheme.muted))))),
        ]),
        const SizedBox(height: 16),
        SwitchListTile(
            title: const Text('参考我的浏览与交易排序'),
            subtitle: const Text('仅在隐私设置已开启个性化推荐时使用；不会自动修改你的设置。'),
            value: recommended,
            onChanged: (v) => setState(() {
                  recommended = v;
                  clearResults();
                })),
        if (recommended) ...[
          const Text('在当前公开结果中，先按明确条件筛选，再优先展示近期实际购买城市、近期浏览城市的内容，其余按公开目录顺序。不改变价格，也不代替授权或成交。'),
          TextButton(onPressed: () async {
            await Navigator.pushNamed(context, '/privacy?view=preferences');
            if (mounted) await load();
          }, child: const Text('调整个性化推荐')),
        ],
        SwitchListTile(
            title: const Text('按明确条件匹配'),
            value: matching,
            onChanged: (v) => setState(() {
                  matching = v;
                  clearResults();
                })),
        if (matching) ...[
          if (kind == 'ARTIST') ...[
            communitySelect(
                '最低星环',
                halo,
                [
                  ('', '不限'),
                  ('0', '0级'),
                  ('1', '1级'),
                  ('2', '2级'),
                  ('3', '3级')
                ],
                (v) => setState(() {
                      halo = v!;
                      clearResults();
                    })),
            TextField(
                controller: tag,
                maxLength: 40,
                decoration: const InputDecoration(labelText: '人物标签'),
                onChanged: (_) => setState(clearResults)),
          ],
          if (kind == 'STOCK') ...[
            communitySelect(
                '许可用途',
                purpose,
                [
                  ('', '不限'),
                  ('PERSONAL_NONCOMMERCIAL', '个人非商业'),
                  ('COMMERCIAL_LIMITED', '约定商用范围')
                ],
                (v) => setState(() {
                      purpose = v!;
                      commercialUse = '';
                      clearResults();
                    })),
            if (purpose == 'COMMERCIAL_LIMITED')
              communitySelect(
                  '商用用途',
                  commercialUse,
                  [
                    ('', '不限'),
                    ('BRAND_PROMOTION', '品牌推广'),
                    ('COMMERCIAL_ADVERTISING', '商业广告'),
                    ('CORPORATE_DISPLAY', '企业展示')
                  ],
                  (v) => setState(() {
                        commercialUse = v!;
                        clearResults();
                      })),
          ],
          if (['STOCK', 'AUDITION'].contains(kind))
            TextField(
                controller: budget,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                    labelText: '最高公开价格（元）', helperText: '留空不限；未公开价格不参与预算匹配'),
                onChanged: (_) => setState(clearResults)),
          if (kind == 'AUDITION')
            communitySelect(
                '试镜方式',
                auditionMode,
                [('', '不限'), ('OFFLINE', '线下试镜'), ('ONLINE_MATERIALS', '线上材料')],
                (v) => setState(() {
                      auditionMode = v!;
                      clearResults();
                    })),
          if (kind == 'NOTICE')
            communitySelect(
                '通告类型',
                noticeType,
                [
                  ('', '不限'),
                  ('DRAMA', '剧集'),
                  ('PERFORMANCE', '商演'),
                  ('COMMERCIAL', '商单'),
                  ('EVENT', '活动'),
                  ('RECRUITMENT', '招募'),
                  ('OFFICIAL', '平台官方')
                ],
                (v) => setState(() {
                      noticeType = v!;
                      clearResults();
                    })),
          const Text('按你明确选择的条件匹配，不计算AI匹配率，不按个人身份改价。进入详情后仍须核对当前授权、有效期与办理资格。'),
        ],
        LayoutBuilder(builder: (context, constraints) {
          final search = FilledButton(
              onPressed: busy ? null : load,
              child: Text(matching ? '开始匹配' : '开始查找'));
          final clear = OutlinedButton(
              onPressed: busy ? null : () {
                setState(() {
                  city.clear();
                  query.clear();
                  budget.clear();
                  tag.clear();
                  purpose = '';
                  commercialUse = '';
                  halo = '';
                  auditionMode = '';
                  noticeType = '';
                  clearResults();
                });
                load();
              },
              child: const Text('清空条件'));
          if (constraints.maxWidth < 300 ||
              MediaQuery.textScalerOf(context).scale(14) > 20) {
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [clear, const SizedBox(height: 10), search]);
          }
          return Row(children: [
            Expanded(child: clear), const SizedBox(width: 12),
            Expanded(flex: 2, child: search),
          ]);
        }),
        const SizedBox(height: 16),
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(error!, style: const TextStyle(color: AccountTheme.danger)),
        if (ranking != null) ...[
          Text(ranking!['personalized'] == true
              ? '当前使用已开启的个性化偏好。每条结果列出实际排序依据。'
              : '当前个性化推荐已关闭，按公开目录顺序展示，仍可筛选和办理。'),
          if (ranking!['catalog_truncated'] == true)
            const Text('当前目录内容较多，本次推荐只覆盖前500条候选，请补充城市或关键词缩小范围。'),
        ],
        const Padding(padding: EdgeInsets.symmetric(vertical: 16),
            child: Text('按公开资料筛选，不代表接受邀约或授予使用权。关闭个性化推荐仍可搜索，不生成虚构AI匹配率。',
                style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6))),
        if (rows.isNotEmpty) ...[
          Row(children: [
            const Expanded(child: Text('已读取的结果', style: TextStyle(
                fontSize: 20, fontWeight: FontWeight.w700))),
            Text('${rows.length} 项', style: const TextStyle(
                fontSize: 14, color: AccountTheme.accent)),
          ]),
          const SizedBox(height: 8),
          const Text('当前已读取数量，不是目录总数', style: TextStyle(
              fontSize: 12, color: AccountTheme.muted)),
          const SizedBox(height: 16),
        ],
        for (final r in rows) result(r),
        if (!busy && error == null && rows.isEmpty)
          Text(cursor == null ? '没有找到当前可公开的内容。' : '本页暂未找到匹配项，可以继续查找。'),
        if (cursor != null)
          tradeButton('继续查找', busy ? null : () => load(more: true),
              outline: true),
        if (error != null)
          tradeButton('重新查找', busy ? null : load, outline: true),
        TextButton(
            onPressed: busy ? null : () => chooseKind('AUDITION'),
            child: Text(kind == 'AUDITION' ? '当前正在查找试镜方案' : '另外查找试镜方案')),
        const Text('结果不代表邀约、出演授权或成交，进入详情后仍须核对权限。关闭个性化仍可按公开资料和明确条件查找。',
            style: TextStyle(color: AccountTheme.muted, height: 1.6)),
      ]);
}

class PublicDirectoryPage extends StatelessWidget {
  const PublicDirectoryPage(
      {super.key, this.featured = false, this.city = '', this.partyId});
  final bool featured;
  final String city;
  final String? partyId;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'directory',
      partyRequired: false,
      route: partyId == null
          ? featured
              ? '/directory/featured'
              : '/directory'
          : '/directory/organization?partyId=$partyId',
      title: featured ? '精选艺人' : '公开机构',
      builder: (s) => _Directory(
          session: s, featured: featured, city: city, partyId: partyId));
}

class _Directory extends StatefulWidget {
  const _Directory(
      {required this.session,
      required this.featured,
      required this.city,
      this.partyId});
  final AccountSession session;
  final bool featured;
  final String city;
  final String? partyId;
  @override
  State<_Directory> createState() => _DirectoryState();
}

class _DirectoryState extends State<_Directory> {
  late final city = TextEditingController(text: widget.city);
  final query = TextEditingController();
  List<Map<String, dynamic>> rows = [];
  List<NoticePublic> notices = [];
  String? cursor, noticeCursor, error, noticeError;
  bool busy = false, noticesBusy = false, hasRead = false;
  int ticket = 0;
  final seen = <String>{}, noticeSeen = <String>{};
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    if (busy || more && cursor == null) return;
    final t = ++ticket, previous = more ? cursor : null;
    setState(() {
      busy = true;
      error = null;
      if (!more) {
        hasRead = false;
        rows = [];
        cursor = null;
        seen.clear();
        notices = [];
        noticesBusy = false;
        noticeCursor = null;
        noticeSeen.clear();
      }
    });
    try {
      final api = CommunityApi(widget.session, 'directory');
      final d = await api.read(
          widget.partyId != null
              ? 'organizations/${communityRequiredId(widget.partyId!, '机构')}'
              : widget.featured
                  ? 'featured-artists'
                  : 'organizations',
          account: true,
          query: widget.partyId != null
              ? null
              : {
                  'limit': 20,
                  if (city.text.trim().isNotEmpty) 'city': city.text.trim(),
                  if (query.text.trim().isNotEmpty) 'q': query.text.trim(),
                  if (previous != null) 'cursor': previous,
                });
      final result = widget.partyId != null
          ? [d]
          : validatePublicPage(d, previous: previous);
      for (final r in result) {
        communityRequire(
            communityId(r['record_id']) && r['object_version'] is int);
        if (widget.featured) {
          communityRequire(r['selection_kind'] == 'EDITORIAL_SELECTION' &&
              r['recommendation'] is String &&
              communityId(communityMap(r['artist'])['listing_id']));
        } else {
          communityRequire(communityId(r['party_id']) &&
              r['display_name'] is String &&
              r['introduction'] is String &&
              r['verified_capabilities'] is List);
        }
      }
      if (!mounted || t != ticket) return;
      final next = widget.partyId != null ? null : d['next_cursor'] as String?;
      communityRequire(next == null || seen.add(next));
      setState(() {
        rows = [...rows, ...result];
        cursor = next;
        hasRead = true;
      });
      if (widget.partyId != null) await loadNotices();
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          error = publicDirectoryError(e);
          if (e is AccountError && [401, 403, 404, 409].contains(e.status)) {
            rows = [];
            notices = [];
            cursor = noticeCursor = null;
          }
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  Future<void> loadNotices({bool more = false}) async {
    if (noticesBusy || rows.isEmpty || more && noticeCursor == null) return;
    final generation = ticket, previous = more ? noticeCursor : null;
    setState(() {
      noticesBusy = true;
      noticeError = null;
      if (!more) {
        notices = [];
        noticeCursor = null;
        noticeSeen.clear();
      }
    });
    bool current() => mounted && generation == ticket;
    try {
      final organization = await CommunityApi(widget.session, 'directory')
          .read('organizations/${widget.partyId}', account: true);
      if (!current()) return;
      communityRequire(organization['party_id'] == widget.partyId &&
          organization['object_version'] is int);
      setState(() => rows = [organization]);
      final p = await NoticesApi(widget.session)
          .catalog(publisherPartyId: widget.partyId, cursor: previous);
      if (!current()) return;
      communityRequire(p.cursor == null || noticeSeen.add(p.cursor!));
      setState(() {
        notices = [...(more ? notices : <NoticePublic>[]), ...p.items];
        noticeCursor = p.cursor;
      });
    } catch (e) {
      if (current()) {
        setState(() {
          noticeError = publicDirectoryError(e);
          if (e is AccountError && [401, 403, 404, 409].contains(e.status)) {
            error = noticeError;
            rows = [];
            notices = [];
            noticeCursor = null;
          }
        });
      }
    } finally {
      if (current()) setState(() => noticesBusy = false);
    }
  }

  void clearFilters() {
    ticket++;
    hasRead = false;
    rows = [];
    cursor = null;
    seen.clear();
    notices = [];
    noticeCursor = null;
    noticeSeen.clear();
    noticesBusy = busy = false;
    error = noticeError = null;
  }

  @override
  void dispose() {
    ticket++;
    city.dispose();
    query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      tradeScaffold(context, widget.featured ? '精选艺人' : '公开机构', [
        tradeHeading(widget.featured ? '精选艺人' : '认识公开机构',
            eyebrow: widget.featured ? '运营推荐 / 当前有效公开档案' : '机构目录 / 已审核公开介绍'),
        if (widget.partyId == null) ...[
          TextField(
              controller: city,
              maxLength: 100,
              decoration: const InputDecoration(labelText: '城市，留空查看全部'),
              enabled: !busy,
              onChanged: (_) => setState(clearFilters)),
          TextField(
              controller: query,
              maxLength: 200,
              decoration: const InputDecoration(labelText: '名称或介绍关键词'),
              enabled: !busy,
              onChanged: (_) => setState(clearFilters)),
          tradeButton('查找', busy ? null : load),
        ],
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(error!, style: const TextStyle(color: AccountTheme.danger)),
        for (final r in rows)
          if (widget.featured)
            tradeSection(communityMap(r['artist'])['display_name'], [
              const Chip(label: Text('精选艺人 · 运营推荐')),
              const SizedBox(height: 8),
              Text(r['recommendation']),
              tradeFact('城市', communityMap(r['artist'])['city']),
              tradeButton('查看艺人公开资料', () async {
                await Navigator.pushNamed(
                    context,
                    publicContentRoute(
                        'ARTIST', communityMap(r['artist'])['listing_id']));
                if (mounted) load();
              }, outline: true),
            ])
          else
            tradeSection(r['display_name'], [
              const Chip(label: Text('机构公开资料')),
              const SizedBox(height: 10),
              if (widget.partyId != null)
                OrganizationCover(
                    key: ValueKey('${r['record_id']}:${r['object_version']}'),
                    session: widget.session,
                    organization: r),
              tradeFact('城市', r['city']),
              Text(r['introduction'], style: const TextStyle(height: 1.6)),
              tradeFact(
                  '已核对能力',
                  (r['verified_capabilities'] as List)
                      .map((c) =>
                          const {
                            'AUTHOR': '作者',
                            'SCRIPT_SUPPLIER': '剧本供给',
                            'PRODUCER': '制作',
                            'MCN': '经纪',
                            'BRAND_CLIENT': '品牌委托'
                          }[c] ??
                          c)
                      .join('、')),
              if (widget.partyId == null)
                tradeButton('查看机构与全部通告', () async {
                  await Navigator.pushNamed(context,
                      '/directory/organization?partyId=${r['party_id']}');
                  if (mounted) load();
                }, outline: true),
            ]),
        if (!busy && error == null && !hasRead)
          const Text('筛选条件尚未读取，请点击查找。'),
        if (!busy && error == null && hasRead && rows.isEmpty)
          Text(cursor == null ? '当前没有可公开的资料。' : '本页暂无可显示资料，可继续读取。'),
        if (cursor != null)
          tradeButton('继续读取', busy ? null : () => load(more: true),
              outline: true),
        if (widget.partyId != null && rows.isNotEmpty)
          tradeSection('机构公开通告', [
            if (noticesBusy) const LinearProgressIndicator(),
            if (noticeError != null) Text(noticeError!),
            for (final n in notices)
              ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(n.notice['title']),
                  subtitle: Text(noticeTypes[n.notice['type']] ?? '通告'),
                  trailing: const Icon(Icons.north_east),
                  onTap: () async {
                    await Navigator.pushNamed(
                        context, publicContentRoute('NOTICE', n.id));
                    if (mounted) load();
                  }),
            if (!busy && !noticesBusy && noticeError == null && notices.isEmpty)
              Text(noticeCursor == null ? '当前没有公开通告。' : '本页暂无可显示通告，可继续读取。'),
            if (noticeCursor != null)
              tradeButton('继续读取机构通告',
                  noticesBusy ? null : () => loadNotices(more: true),
                  outline: true),
            if (noticeError != null)
              tradeButton('重新读取机构通告', noticesBusy ? null : loadNotices,
                  outline: true),
          ]),
        tradeButton('刷新当前公开资料', busy ? null : load, outline: true),
        if (widget.partyId != null && rows.isEmpty && error != null)
          tradeButton('返回公开机构目录',
              () => Navigator.pushReplacementNamed(context, '/directory'),
              outline: true),
        Text(
            widget.featured
                ? '精选由运营推荐，不代表明星认证或成绩排名。'
                : '公开介绍不自动授予接单、制作或代办权限，具体业务仍按原入口核对。',
            style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
      ]);
}

class OrganizationCover extends StatefulWidget {
  const OrganizationCover(
      {super.key, required this.session, required this.organization});
  final AccountSession session;
  final Map<String, dynamic> organization;
  @override
  State<OrganizationCover> createState() => _OrganizationCoverState();
}

class _OrganizationCoverState extends State<OrganizationCover> {
  MemoryImage? image;
  String? error;
  bool busy = false;
  int ticket = 0;
  bool active = true;
  @override
  void initState() {
    super.initState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = TickerMode.valuesOf(context).enabled &&
        (ModalRoute.of(context)?.isCurrent ?? true);
    if (!next) {
      ticket++;
      image?.evict();
      image = null;
      busy = false;
    }
    active = next;
    if (active &&
        image == null &&
        error == null &&
        !busy &&
        widget.organization['cover'] != null) {
      load();
    }
  }

  Future<void> load() async {
    final t = ++ticket;
    busy = true;
    try {
      final meta = communityMap(widget.organization['cover']);
      communityRequire(meta['byte_size'] is int &&
          meta['byte_size'] > 0 &&
          meta['byte_size'] <= 8388608 &&
          ['image/jpeg', 'image/png'].contains(meta['media_type']));
      final Uint8List bytes = await CommunityApi(widget.session, 'directory')
          .bytes('organizations/${widget.organization['party_id']}/cover',
              account: true, sha256Value: '${meta['content_sha256']}');
      communityRequire(bytes.length == meta['byte_size'] &&
          sha256.convert(bytes).toString() == meta['content_sha256']);
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      communityRequire(frame.image.width > 0 && frame.image.height > 0);
      frame.image.dispose();
      codec.dispose();
      if (mounted && active && t == ticket) {
        setState(() => image = MemoryImage(bytes));
      }
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          image?.evict();
          image = null;
          error = publicDirectoryError(e);
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  @override
  void dispose() {
    ticket++;
    image?.evict();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: ColoredBox(
              color: AccountTheme.surface,
              child: image != null
          ? Image(
              image: image!,
              fit: BoxFit.cover,
              height: 190,
              errorBuilder: (context, failure, stack) =>
                  const Text('主图无法显示，请刷新机构资料。'))
          : Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (busy) const LinearProgressIndicator(),
              Text(widget.organization['cover'] == null
                  ? '机构未提供公开主图。'
                  : error ?? '正在读取获准主图。'),
              if (error != null)
                TextButton(
                    onPressed: busy
                        ? null
                        : () {
                            error = null;
                            load();
                          },
                    child: const Text('重新读取主图')),
            ]))));
}
