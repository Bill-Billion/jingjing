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
  final query = TextEditingController();
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
    cursor = null;
    seen.clear();
    busy = false;
    error = null;
  }

  Future<void> load({bool more = false}) async {
    if (more && (busy || cursor == null)) return;
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
      final d = await CommunityApi(widget.session, 'discovery')
          .read('search', account: true, query: {
        'kind': activeKind,
        'limit': 20,
        if (activeCity.isNotEmpty) 'city': activeCity,
        if (activeQuery.isNotEmpty) 'q': activeQuery,
        if (previous != null) 'cursor': previous,
      });
      final result = validatePublicPage(d, previous: previous);
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
        rows = [...rows, ...result];
        cursor = next;
      });
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          error = communityError(e);
          if (e is AccountError &&
              [400, 401, 403, 404, 409].contains(e.status)) {
            rows = [];
            cursor = null;
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
    super.dispose();
  }

  Widget result(Map<String, dynamic> r) {
    final data = activeKind == 'NOTICE' ? communityMap(r['notice']) : r;
    final id = (activeKind == 'ARTIST' ? r['listing_id'] : r['id']) as String;
    return tradeSection('${data['display_name'] ?? data['title'] ?? '试镜方案'}', [
      tradeFact('城市', data['city']),
      if (activeKind == 'AUDITION')
        tradeFact(
            '服务费用',
            r['unit_minor'] == null
                ? '价格未公开'
                : communityMoney(r['unit_minor'])),
      if (activeKind == 'STOCK')
        tradeFact('个人许可价格', communityMoney(r['unit_minor'])),
      if (data['introduction'] is String || data['description'] is String)
        Text('${data['introduction'] ?? data['description']}',
            maxLines: 3, overflow: TextOverflow.ellipsis),
      tradeButton('查看${discoveryKinds[activeKind]}', () async {
        await Navigator.pushNamed(context, publicContentRoute(activeKind, id));
        if (mounted) await load();
      }, outline: true),
    ]);
  }

  @override
  Widget build(BuildContext context) => tradeScaffold(context, '查找公开内容', [
        tradeHeading('找到感兴趣的内容', eyebrow: '公开目录 / 当前可用内容'),
        communitySelect('内容类型', kind,
            discoveryKinds.entries.map((e) => (e.key, e.value)).toList(), (v) {
          setState(() {
            kind = v!;
            clearResults();
          });
          load();
        }),
        TextField(
            controller: city,
            maxLength: 100,
            decoration: const InputDecoration(
                labelText: '城市', hintText: '留空查看全部城市，也可输入其他城市'),
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
        TextField(
            controller: query,
            maxLength: 200,
            decoration:
                const InputDecoration(labelText: '关键词', hintText: '按公开名称、介绍查找'),
            onChanged: (_) => setState(clearResults),
            onSubmitted: (_) => load()),
        tradeButton('查找', busy ? null : load),
        tradeButton('清空条件', () {
          setState(() {
            city.clear();
            query.clear();
            clearResults();
          });
          load();
        }, outline: true),
        if (busy) const LinearProgressIndicator(),
        if (error != null)
          Text(error!, style: const TextStyle(color: AccountTheme.danger)),
        for (final r in rows) result(r),
        if (!busy && error == null && rows.isEmpty)
          Text(cursor == null ? '没有找到当前可公开的内容。' : '本页暂未找到匹配项，可以继续查找。'),
        if (cursor != null)
          tradeButton('继续查找', busy ? null : () => load(more: true),
              outline: true),
        if (error != null)
          tradeButton('重新查找', busy ? null : load, outline: true),
        const Text('结果按目录顺序展示。进入详情时会重新核对公开状态和办理权限。',
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
  bool busy = false, noticesBusy = false;
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
              const Text('精选艺人 · 运营推荐'),
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
        if (!busy && error == null && rows.isEmpty)
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
            if (!noticesBusy && notices.isEmpty)
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
            ]));
}
