import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../account/account_session.dart';
import '../account/account_theme.dart';
import '../artists/artists_pages.dart'
    show openArtistPublicDetails, openArtistFilters;
import '../artists/artists_public_media.dart';
import '../notices/notices_models.dart';
import '../stock/stock_public_card.dart';
import '../widgets/editorial_icons.dart';
import 'plaza_data.dart';

const _wash = Color(0xFFE5E1D7);

String plazaCityLabel(String value) => value.isEmpty
    ? '全部城市'
    : value.endsWith('市')
        ? value.substring(0, value.length - 1)
        : value;

String _cityRoute(String path, String city, {String tag = ''}) =>
    Uri(path: path, queryParameters: {
      if (city.isNotEmpty) 'city': city,
      if (tag.isNotEmpty) 'tag': tag,
    }).toString();

class PlazaPage extends StatefulWidget {
  const PlazaPage(
      {super.key,
      required this.session,
      required this.onOpen,
      required this.onCityChanged,
      this.initialCity = '',
      this.active = true});
  final AccountSession session;
  final Future<void> Function(String) onOpen;
  final ValueChanged<String> onCityChanged;
  final String initialCity;
  final bool active;

  @override
  State<PlazaPage> createState() => _PlazaPageState();
}

class _PlazaPageState extends State<PlazaPage> {
  late final data = PlazaData(widget.session, city: widget.initialCity);
  int channel = 0, _cityVersion = 0;
  bool _ready = false, _started = false;
  String? _cityNotice;
  static const _cityPreference = 'plaza_manual_city_v1';

  @override
  void initState() {
    super.initState();
    unawaited(_restoreCity());
  }

  Future<void> _restoreCity() async {
    final version = _cityVersion;
    try {
      final preferences = await SharedPreferences.getInstance();
      final saved = preferences.getString(_cityPreference);
      if (!mounted) return;
      if (saved != null && version == _cityVersion) {
        data.city = saved;
        widget.onCityChanged(saved);
      }
    } catch (_) {
      // Browsing is still available when device preference storage is blocked.
    }
    if (!mounted) return;
    _ready = true;
    if (widget.active) {
      _started = true;
      await data.load();
    }
  }

  @override
  void didUpdateWidget(PlazaPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_ready && widget.active && !oldWidget.active && !_started) {
      _started = true;
      unawaited(data.load());
    }
  }

  Future<void> _chooseCity() async {
    final selected = await Navigator.push<String>(
        context,
        MaterialPageRoute(
            builder: (_) => PlazaCityPage(
                currentCity: data.city,
                availableCities: data.availableCities)));
    if (!mounted || selected == null) return;
    await _useCity(selected);
  }

  Future<void> _useCity(String selected) async {
    _cityVersion++;
    _cityNotice = null;
    widget.onCityChanged(selected);
    unawaited(data.changeCity(selected));
    try {
      final preferences = await SharedPreferences.getInstance();
      if (!await preferences.setString(_cityPreference, selected)) {
        throw StateError('city preference was not saved');
      }
    } catch (_) {
      if (mounted) {
        setState(() => _cityNotice = '城市已切换，本次选择暂未保存到本机。');
      }
    }
  }

  Future<void> _openAll() async {
    await Navigator.push<void>(
        context,
        MaterialPageRoute(
            builder: (_) =>
                PlazaDirectoryPage(city: data.city, onOpen: widget.onOpen)));
    if (mounted && widget.active) unawaited(data.load());
  }

  Widget _header() => LayoutBuilder(builder: (context, box) {
        final narrow = box.maxWidth < 330 ||
            MediaQuery.textScalerOf(context).scale(14) > 18;
        final title = const Text('晶晶日上',
            style: TextStyle(
                fontFamily: AccountTheme.serif,
                fontSize: 28,
                fontWeight: FontWeight.w900,
                height: 1.3));
        final tools = <Widget>[
          TextButton(
              key: const ValueKey('plaza-city'),
              onPressed: _chooseCity,
              style: TextButton.styleFrom(
                  foregroundColor: AccountTheme.text,
                  padding: const EdgeInsets.symmetric(horizontal: 4)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: narrow ? 180 : 70),
                    child: Text(plazaCityLabel(data.city),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13))),
                const Icon(EditorialIcons.arrowDown, size: 14),
              ])),
          IconButton(
              tooltip: '搜索',
              onPressed: () => widget.onOpen(_cityRoute('/search', data.city)),
              icon: const Icon(EditorialIcons.search, size: 24)),
          IconButton(
              tooltip: '账号与身份',
              onPressed: () => widget.onOpen('/account'),
              icon: const Icon(EditorialIcons.user, size: 24)),
        ];
        return Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 12, 6),
            child: narrow
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                        title,
                        Row(children: [
                          tools.first,
                          const Spacer(),
                          ...tools.skip(1)
                        ])
                      ])
                : Row(children: [Expanded(child: title), ...tools]));
      });

  Widget _channels() => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(children: [
        for (final (index, label) in ['精选', '艺人', '视频', '同城'].indexed)
          Expanded(
              child: Semantics(
                  selected: channel == index,
                  child: InkWell(
                      key: ValueKey('plaza-channel-$index'),
                      onTap: () => setState(() => channel = index),
                      child: Container(
                          constraints: const BoxConstraints(minHeight: 48),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                              border: Border(
                                  bottom: BorderSide(
                                      color: channel == index
                                          ? AccountTheme.vermilion
                                          : AccountTheme.border,
                                      width: channel == index ? 2 : .6))),
                          child: Text(label,
                              style: TextStyle(
                                  fontFamily: channel == index
                                      ? AccountTheme.serif
                                      : AccountTheme.sans,
                                  fontSize: 16,
                                  fontWeight: channel == index
                                      ? FontWeight.w700
                                      : FontWeight.w400))))))
      ]));

  Widget _quickTools() => Padding(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
      child: Row(children: [
        for (final item in <(String, IconData, VoidCallback)>[
          (
            '艺人榜',
            EditorialIcons.histogram,
            () => widget.onOpen('/engagement?view=rankings')
          ),
          (
            '找机构',
            EditorialIcons.officeBuilding,
            () => widget.onOpen('/engagement?view=buyers')
          ),
          ('全部', EditorialIcons.grid, _openAll),
        ])
          Expanded(
              child: InkWell(
                  onTap: item.$3,
                  child: Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(item.$2, size: 24),
                        const SizedBox(height: 9),
                        Text(item.$1, style: const TextStyle(fontSize: 12)),
                      ]))))
      ]));

  Widget _heading(String title,
          {String? link, VoidCallback? onTap, double top = 20}) =>
      Padding(
          padding: EdgeInsets.only(top: top, bottom: 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
            Expanded(
                child: Semantics(
                    header: true,
                    child: Text(title,
                        style: const TextStyle(
                            fontFamily: AccountTheme.serif,
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            height: 1.4)))),
            if (link != null)
              TextButton(
                  onPressed: onTap,
                  style: TextButton.styleFrom(
                      foregroundColor: AccountTheme.text,
                      padding: const EdgeInsets.only(left: 8),
                      alignment: Alignment.centerRight),
                  child: Text(link, style: const TextStyle(fontSize: 12))),
          ]));

  Widget _panel(String title, String message,
          {String? action, VoidCallback? onTap, bool busy = false}) =>
      Container(
          color: _wash,
          padding: const EdgeInsets.all(14),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (busy) ...[
              const LinearProgressIndicator(minHeight: 2),
              const SizedBox(height: 12),
            ],
            Text(title,
                style: const TextStyle(
                    fontFamily: AccountTheme.serif,
                    fontSize: 16,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(message,
                style: const TextStyle(
                    fontSize: 12, height: 1.6, color: AccountTheme.muted)),
            if (action != null)
              Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                      onPressed: onTap,
                      style: TextButton.styleFrom(padding: EdgeInsets.zero),
                      child:
                          Text(action, style: const TextStyle(fontSize: 12)))),
          ]));

  List<Widget> _feedState<T>(PlazaFeed<T> feed, String title, String empty,
          VoidCallback retry, VoidCallback more) =>
      [
        if (feed.busy && feed.items.isEmpty)
          _panel('正在读取$title', '各类内容分别读取，已完成的栏目可先浏览。', busy: true)
        else if (feed.error != null)
          _panel('$title读取未完成', feed.error!, action: '重新读取', onTap: retry)
        else if (feed.hasRead && feed.items.isEmpty)
          _panel(
              feed.cursor != null ? '本页暂无匹配' : empty,
              feed.cursor != null
                  ? '仍有下一页，请继续读取后再判断是否没有结果。'
                  : '可以切换城市或筛选，查看其他公开内容。',
              action: feed.cursor != null ? '继续读取' : '重新读取',
              onTap: feed.cursor != null ? more : retry),
      ];

  Widget _stars() => Column(children: [
        _heading('明星推荐', top: channel == 0 ? 16 : 20),
        ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 92),
            child: _panel('暂无本城明星推荐', '可以继续查看本地艺人，或切换城市。')),
        Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text('当前城市 · ${plazaCityLabel(data.city)}',
                style:
                    const TextStyle(fontSize: 12, color: AccountTheme.muted))),
        const Divider(height: 1),
      ]);

  Future<void> _openArtist(Map<String, dynamic> listing) async {
    await openArtistPublicDetails(context,
        session: widget.session, listing: listing);
    if (mounted && widget.active) await data.loadArtists();
  }

  Widget _grid<T>(
          List<T> items, int columns, double gap, Widget Function(T) card) =>
      LayoutBuilder(builder: (context, box) {
        final enlarged = MediaQuery.textScalerOf(context).scale(14) > 19;
        final count = enlarged ? 2 : columns;
        final width = (box.maxWidth - gap * (count - 1)) / count;
        return Wrap(spacing: gap, runSpacing: 14, children: [
          for (final item in items) SizedBox(width: width, child: card(item))
        ]);
      });

  Widget _artistCard(Map<String, dynamic> row) => Semantics(
      button: true,
      label: '查看艺人详情，${row['display_name']}，${row['city']}',
      child: Material(
          color: AccountTheme.canvas,
          child: InkWell(
              onTap: () => _openArtist(row),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ArtistPublicPortrait(
                        key: ValueKey(
                            '${data.artists.revision}:${row['listing_id']}'),
                        session: widget.session,
                        listing: row,
                        onUnavailable: () =>
                            data.removeUnavailableArtist(row['listing_id'])),
                    const SizedBox(height: 6),
                    Text(row['display_name'],
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontFamily: AccountTheme.serif,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            height: 1.4)),
                    const SizedBox(height: 2),
                    Text(
                        [
                          plazaCityLabel(row['city']),
                          ...(row['tags'] as List).cast<String>().take(1)
                        ].join(' · '),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 11,
                            height: 1.4,
                            color: AccountTheme.muted)),
                  ]))));

  Future<void> _artistFilters() async {
    final selected = await openArtistFilters(context,
        city: data.city, tag: data.tag, audition: data.audition);
    if (!mounted || selected == null) return;
    data.tag = selected.tag;
    data.audition = selected.audition;
    if (selected.city != data.city) {
      await _useCity(selected.city);
    } else {
      await data.loadArtists();
    }
  }

  List<Widget> _artists({bool compact = false}) => [
        _heading('本地艺人',
            link: compact ? '全部艺人 ↗' : null,
            onTap: () => setState(() => channel = 1)),
        if (!compact) ...[
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton.icon(
                onPressed: _artistFilters,
                icon: const Icon(EditorialIcons.arrowDown, size: 14),
                label: Text(data.tag.isEmpty ? '全部标签' : data.tag)),
            OutlinedButton(
                style: OutlinedButton.styleFrom(
                    side: BorderSide(
                        color: data.audition
                            ? AccountTheme.vermilion
                            : AccountTheme.border)),
                onPressed: () =>
                    data.filterArtists(tag: data.tag, audition: !data.audition),
                child: const Text('试镜展示')),
            OutlinedButton.icon(
                onPressed: _artistFilters,
                icon: const Icon(EditorialIcons.filter, size: 16),
                label: const Text('筛选')),
          ]),
          const SizedBox(height: 18),
        ],
        if (compact && (data.tag.isNotEmpty || data.audition))
          Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                  [
                    '当前筛选',
                    if (data.tag.isNotEmpty) data.tag,
                    if (data.audition) '试镜展示',
                  ].join(' · '),
                  style: const TextStyle(
                      fontSize: 12, color: AccountTheme.muted))),
        ..._feedState(data.artists, '艺人', '当前城市暂无公开艺人', data.loadArtists,
            () => data.loadArtists(more: true)),
        if (data.artists.items.isNotEmpty)
          _grid(
              compact
                  ? data.artists.items.take(8).toList()
                  : data.artists.items,
              compact ? 4 : 3,
              compact ? 6.5 : 12,
              _artistCard),
        if (!compact &&
            data.artists.cursor != null &&
            data.artists.items.isNotEmpty)
          Padding(
              padding: const EdgeInsets.only(top: 18),
              child: OutlinedButton(
                  onPressed: data.artists.busy
                      ? null
                      : () => data.loadArtists(more: true),
                  child: Text(data.artists.busy ? '正在读取' : '查看更多艺人 ↗'))),
        if (!compact) ...[
          const SizedBox(height: 14),
          const Text('姓名、城市与特长均以公开资料为准。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
        ],
      ];

  List<Widget> _works({bool compact = false}) => [
        _heading('作品精选',
            link: '全部作品 ↗', onTap: () => widget.onOpen('/stock/catalog')),
        if (!compact) ...[
          const Text('查看获准预览，购买前核对个人许可。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
          const SizedBox(height: 18),
        ],
        ..._feedState(data.works, '作品', '暂无公开作品', data.loadWorks,
            () => data.loadWorks(more: true)),
        if (data.works.items.isNotEmpty)
          _grid(
              compact ? data.works.items.take(6).toList() : data.works.items,
              2,
              8,
              (offer) => StockPublicCard(
                  session: widget.session,
                  offer: offer,
                  onRefreshOffer: data.loadWorks,
                  onTap: () async {
                    await widget.onOpen('/stock/video?listingId=${offer.id}');
                    if (mounted && widget.active) await data.loadWorks();
                  })),
        if (!compact) ...[
          if (data.works.cursor != null && data.works.items.isNotEmpty)
            OutlinedButton(
                onPressed:
                    data.works.busy ? null : () => data.loadWorks(more: true),
                child: const Text('继续读取作品')),
          const SizedBox(height: 18),
          const Text('作品按公开目录展示，面向全部城市。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
        ],
      ];

  Widget _notice(NoticePublic row) => InkWell(
      onTap: () async {
        await widget.onOpen('/notices/public?noticeId=${row.id}');
        if (mounted && widget.active) await data.loadNotices();
      },
      child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AccountTheme.border))),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Padding(
                padding: EdgeInsets.only(top: 7),
                child: SizedBox(
                    width: 7,
                    height: 7,
                    child: ColoredBox(color: AccountTheme.vermilion))),
            const SizedBox(width: 7),
            SizedBox(
                width: 48,
                child: Text(noticeTypes[row.notice['type']]!,
                    style: const TextStyle(fontSize: 11, height: 1.6))),
            const SizedBox(width: 8),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text(row.notice['title'],
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontFamily: AccountTheme.serif,
                          fontSize: 17,
                          height: 1.4,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(height: 5),
                  Text('${plazaCityLabel(row.notice['city'])} · 查看通告',
                      style: const TextStyle(
                          fontSize: 12,
                          height: 1.5,
                          color: AccountTheme.muted)),
                ])),
            const SizedBox(width: 8),
            const Icon(EditorialIcons.arrowRight, size: 20),
          ])));

  List<Widget> _notices({bool compact = false}) => [
        _heading('同城机会',
            link: compact ? '更多 ↗' : plazaCityLabel(data.city),
            onTap: compact ? () => setState(() => channel = 3) : _chooseCity),
        if (!compact) ...[
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final option
                in <String?, String>{null: '全部', ...noticeTypes}.entries)
              OutlinedButton(
                  style: OutlinedButton.styleFrom(
                      side: BorderSide(
                          color: data.noticeType == option.key
                              ? AccountTheme.vermilion
                              : AccountTheme.border)),
                  onPressed: () => data.filterNotices(option.key),
                  child: Text(option.value)),
          ]),
          const SizedBox(height: 14),
        ],
        ..._feedState(data.notices, '通告', '当前城市暂无公开通告', data.loadNotices,
            () => data.loadNotices(more: true)),
        if (compact && data.noticeType != null)
          Text('当前类别 · ${noticeTypes[data.noticeType]}',
              style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
        for (final row
            in compact ? data.notices.items.take(2) : data.notices.items)
          _notice(row),
        if (!compact) ...[
          if (data.notices.cursor != null && data.notices.items.isNotEmpty)
            OutlinedButton(
                onPressed: data.notices.busy
                    ? null
                    : () => data.loadNotices(more: true),
                child: const Text('继续读取通告')),
          const SizedBox(height: 16),
          OutlinedButton(
              onPressed: () =>
                  widget.onOpen(_cityRoute('/notices/catalog', data.city)),
              child: const Text('查看全部通告 ↗')),
          const SizedBox(height: 12),
          const Text('投稿为单向递交，感兴趣后由平台客服跟进。',
              style: TextStyle(
                  fontSize: 12, height: 1.6, color: AccountTheme.muted)),
        ],
      ];

  Widget _story() => Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: LayoutBuilder(builder: (context, box) {
        final enlarged = MediaQuery.textScalerOf(context).scale(14) > 19;
        final title =
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('把你的故事拍成片',
              style: TextStyle(
                  fontFamily: AccountTheme.serif,
                  fontSize: 19,
                  height: 1.4,
                  fontWeight: FontWeight.w900)),
          TextButton(
              style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  foregroundColor: AccountTheme.muted),
              onPressed: () => widget.onOpen('/customization'),
              child: const Text('我的故事与草稿 ↗', style: TextStyle(fontSize: 12))),
        ]);
        final button = FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: AccountTheme.accent,
                foregroundColor: Colors.white),
            onPressed: () => widget.onOpen('/customization/new'),
            child: const Text('写下故事'));
        return enlarged
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [title, button])
            : Row(children: [Expanded(child: title), button]);
      }));

  Widget _login() {
    final destination = switch (channel) {
      1 => _cityRoute('/artists/catalog', data.city, tag: data.tag),
      2 => '/stock/catalog',
      3 => _cityRoute('/notices/catalog', data.city),
      _ => '/square',
    };
    return _panel('登录后浏览', '公开目录仍需登录。登录后回到当前目录和筛选。',
        action: '登录并继续',
        onTap: () => widget.onOpen(
            Uri(path: '/login', queryParameters: {'returnRoute': destination})
                .toString()));
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
      animation: data,
      builder: (context, _) => ListView(
              key: PageStorageKey('plaza-channel-$channel'),
              primary: false,
              padding: EdgeInsets.zero,
              children: [
                _header(),
                _channels(),
                if (channel == 0) _quickTools(),
                Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_cityNotice != null)
                            Text(_cityNotice!,
                                style: const TextStyle(
                                    fontSize: 12, color: AccountTheme.muted)),
                          if (!widget.session.isLoggedIn) ...[
                            const SizedBox(height: 24),
                            _login(),
                            _story(),
                          ] else
                            ...switch (channel) {
                              1 => [
                                  _stars(),
                                  ..._artists(),
                                  const SizedBox(height: 24)
                                ],
                              2 => [
                                  ..._works(),
                                  const Divider(height: 32),
                                  _story()
                                ],
                              3 => [..._notices(), const SizedBox(height: 24)],
                              _ => [
                                  _stars(),
                                  ..._artists(compact: true),
                                  const Divider(height: 32),
                                  ..._works(compact: true),
                                  ..._notices(compact: true),
                                  _story(),
                                ]
                            },
                        ])),
              ]));

  @override
  void dispose() {
    data.dispose();
    super.dispose();
  }
}

class PlazaCityPage extends StatefulWidget {
  const PlazaCityPage(
      {super.key, required this.currentCity, required this.availableCities});
  final String currentCity;
  final Set<String> availableCities;
  @override
  State<PlazaCityPage> createState() => _PlazaCityPageState();
}

class _PlazaCityPageState extends State<PlazaCityPage> {
  final field = TextEditingController();
  String? error;

  String _queryValue(String label) => widget.availableCities.firstWhere(
      (value) => plazaCityLabel(value) == label,
      orElse: () => plazaCityLabel(widget.currentCity) == label
          ? widget.currentCity
          : '$label市');

  Widget _title(String title) => Padding(
      padding: const EdgeInsets.only(top: 26, bottom: 14),
      child: Text(title,
          style: const TextStyle(
              fontFamily: AccountTheme.serif,
              fontSize: 24,
              height: 1.4,
              fontWeight: FontWeight.w900)));

  void _manual() {
    final city = field.text.trim();
    if (city.isEmpty) {
      setState(() => error = '请填写城市名称，或选择全部城市。');
      return;
    }
    Navigator.pop(context, city);
  }

  @override
  Widget build(BuildContext context) => AccountTheme(
      plaza: true,
      child: Scaffold(
          appBar: AppBar(title: const Text('选择城市')),
          body: SafeArea(
              child: ListView(
                  padding: const EdgeInsets.fromLTRB(18, 16, 18, 24),
                  children: [
                TextField(
                    key: const ValueKey('plaza-city-input'),
                    controller: field,
                    maxLength: 100,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _manual(),
                    decoration: InputDecoration(
                        labelText: '搜索或手动输入城市',
                        hintText: '输入城市名称',
                        errorText: error)),
                Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                        onPressed: _manual, child: const Text('使用输入城市'))),
                _title('当前浏览'),
                Text(plazaCityLabel(widget.currentCity),
                    style: const TextStyle(
                        fontFamily: AccountTheme.serif,
                        fontSize: 32,
                        height: 1.4,
                        fontWeight: FontWeight.w900)),
                const SizedBox(height: 10),
                const Text('手动选择优先，重新进入时保留选择。',
                    style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
                _title('当前位置'),
                const Text('暂未获取所在城市，可直接手动选择。',
                    style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
                const SizedBox(height: 14),
                const OutlinedButton(
                    onPressed: null, child: Text('获取当前位置 · 暂未开放')),
                _title('热门城市'),
                LayoutBuilder(builder: (context, box) {
                  final columns =
                      MediaQuery.textScalerOf(context).scale(14) > 19 ? 2 : 3;
                  return Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final city in ['北京', '上海', '杭州', '广州', '深圳', '郑州'])
                      SizedBox(
                          width: (box.maxWidth - (columns - 1) * 8) / columns,
                          child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                  side: BorderSide(
                                      color:
                                          plazaCityLabel(widget.currentCity) ==
                                                  city
                                              ? AccountTheme.vermilion
                                              : AccountTheme.border)),
                              onPressed: () =>
                                  Navigator.pop(context, _queryValue(city)),
                              child: Text(city))),
                  ]);
                }),
                const SizedBox(height: 20),
                OutlinedButton(
                    onPressed: () => Navigator.pop(context, ''),
                    child: const Text('查看全部城市')),
                const SizedBox(height: 18),
                const Text('无法定位时，可直接选择城市。',
                    style: TextStyle(
                        fontSize: 12, height: 1.6, color: AccountTheme.muted)),
              ]))));

  @override
  void dispose() {
    field.dispose();
    super.dispose();
  }
}

class PlazaDirectoryPage extends StatelessWidget {
  const PlazaDirectoryPage(
      {super.key, required this.city, required this.onOpen});
  final String city;
  final Future<void> Function(String) onOpen;

  @override
  Widget build(BuildContext context) => AccountTheme(
      plaza: true,
      child: Scaffold(
          appBar: AppBar(title: const Text('全部功能')),
          body: SafeArea(
              child: ListView(padding: const EdgeInsets.all(18), children: [
            const Text('发现、办理与本人记录',
                style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
            for (final group in <(String, List<(String, String, String)>)>[
              (
                '发现',
                [
                  (
                    '艺人目录',
                    '城市、标签与试镜展示筛选',
                    _cityRoute('/artists/catalog', city)
                  ),
                  ('现成作品', '详情、获准预览与个人许可', '/stock/catalog'),
                  ('艺人榜单与月度评选', '已公开资料与当前榜单', '/engagement?view=rankings'),
                  ('找出品人与机构', '查看公开资料与合作信息', '/engagement?view=buyers'),
                  ('搜索与匹配', '按城市和类型查找公开目录', _cityRoute('/search', city)),
                ]
              ),
              (
                '办理',
                [
                  (
                    '试镜预约',
                    '查看真实服务与可用时间',
                    _cityRoute('/auditions/catalog', city)
                  ),
                  (
                    '通告与投稿',
                    '公开详情、本人授权与单向递交',
                    _cityRoute('/notices/catalog', city)
                  ),
                  ('写下故事', '保存草稿并按模板提交', '/customization/new'),
                  ('平台制作服务', '核对公开服务与原约定', '/production/services'),
                ]
              ),
              (
                '我的',
                [
                  ('我的故事与草稿', '继续填写与查看受理进度', '/customization'),
                  ('订单与报价', '原报价、付款与记录', '/orders'),
                  ('制作与交付', '参与项目与获准交付作品', '/production'),
                  ('合同与原约定', '按权限查看当时保存的内容', '/contract'),
                  ('我已购买的作品', '原个人许可和获准文件', '/stock/purchases'),
                  ('系统与业务通知', '当前账号和办事主体的通知', '/operations/notifications'),
                  ('账号与身份', '核对本次办事身份', '/account'),
                ]
              ),
            ]) ...[
              Padding(
                  padding: const EdgeInsets.only(top: 28, bottom: 10),
                  child: Text(group.$1,
                      style: const TextStyle(
                          fontFamily: AccountTheme.serif,
                          fontSize: 24,
                          fontWeight: FontWeight.w900))),
              for (final entry in group.$2)
                _PlazaDirectoryEntry(
                    title: entry.$1,
                    subtitle: entry.$2,
                    onTap: () => onOpen(entry.$3)),
            ],
          ]))));
}

class PlazaSearchPage extends StatelessWidget {
  const PlazaSearchPage({super.key, this.initialCity = ''});
  final String initialCity;

  @override
  Widget build(BuildContext context) => AccountTheme(
      plaza: true,
      child: Scaffold(
          appBar: AppBar(title: const Text('查找公开内容')),
          body: SafeArea(
              child: ListView(
                  padding: const EdgeInsets.fromLTRB(18, 24, 18, 24),
                  children: [
                const Text('按内容类型进入目录，使用已有筛选。',
                    style: TextStyle(
                        fontSize: 12, height: 1.6, color: AccountTheme.muted)),
                const SizedBox(height: 28),
                for (final entry in [
                  (
                    '找艺人',
                    '城市、标签、试镜展示',
                    _cityRoute('/artists/catalog', initialCity)
                  ),
                  (
                    '找作品',
                    '公开作品与个人许可',
                    _cityRoute('/stock/catalog', initialCity)
                  ),
                  (
                    '找通告',
                    '城市、类别与有效状态',
                    _cityRoute('/notices/catalog', initialCity)
                  ),
                  (
                    '找试镜',
                    '当前城市可预约的服务',
                    _cityRoute('/auditions/catalog', initialCity)
                  ),
                ])
                  Padding(
                      padding: const EdgeInsets.only(bottom: 18),
                      child: _PlazaDirectoryEntry(
                          title: entry.$1,
                          subtitle: entry.$2,
                          onTap: () => Navigator.pushNamed(context, entry.$3))),
                OutlinedButton.icon(
                    onPressed: () => Navigator.pushNamed(
                        context, _cityRoute('/search/filters', initialCity)),
                    icon: const Icon(Icons.tune),
                    label: const Text('调整城市与目录筛选')),
                const SizedBox(height: 30),
                const Text('先选择内容类型，再按城市或标签筛选。',
                    style: TextStyle(
                        fontSize: 12, height: 1.6, color: AccountTheme.muted)),
                const SizedBox(height: 12),
                const Text('进入目录后，可继续筛选并查看详情。',
                    style: TextStyle(
                        fontSize: 12, height: 1.6, color: AccountTheme.muted)),
              ]))));
}

class _PlazaDirectoryEntry extends StatelessWidget {
  const _PlazaDirectoryEntry(
      {required this.title, required this.subtitle, required this.onTap});
  final String title, subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
      button: true,
      label: '$title，$subtitle',
      child: Material(
          color: AccountTheme.canvas,
          child: InkWell(
              onTap: onTap,
              child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  constraints: const BoxConstraints(minHeight: 68),
                  decoration: const BoxDecoration(
                      border: Border(
                          bottom: BorderSide(
                              color: AccountTheme.border, width: .6))),
                  child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                            width: 64,
                            child: Row(children: [
                              const SizedBox(
                                  width: 7,
                                  height: 7,
                                  child: ColoredBox(
                                      color: AccountTheme.vermilion)),
                              const SizedBox(width: 7),
                              const Text('入口',
                                  style: TextStyle(fontSize: 11, height: 1.8)),
                            ])),
                        Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              Text(title,
                                  style: const TextStyle(
                                      fontFamily: AccountTheme.serif,
                                      fontSize: 17,
                                      fontWeight: FontWeight.w700,
                                      height: 1.4)),
                              const SizedBox(height: 3),
                              Text(subtitle,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      color: AccountTheme.muted,
                                      height: 1.6)),
                            ])),
                        const SizedBox(width: 8),
                        const Icon(EditorialIcons.arrowRight, size: 20),
                      ])))));
}
