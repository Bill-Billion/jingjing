import 'dart:convert';
import '../account/account_theme.dart';
import '../contract_six/contract_six_pages.dart';
import 'package:flutter/material.dart';
import '../account/account_session.dart';
import '../account/account_api.dart';
import '../account/app_visual.dart';
import '../trade/trade_widgets.dart';
import '../trade/trade_api.dart';
import '../trade/trade_models.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../supply/supply_api.dart';
import '../supply/supply_files.dart';
import 'community_support.dart';
import 'ranking_explanation.dart';
import 'activity_summary_card.dart';

Map<String, dynamic> mcnDashboardForAccount(
    Map<String, dynamic> raw, String accountId,
    {required bool owner}) {
  final assignments = communityRows(raw['assignments']);
  for (final r in assignments) {
    communityRecord(r, kind: 'ASSIGNMENT');
  }
  final orders = communityRows(raw['orders']);
  communityRequire(raw['total_accrual_minor'] is int &&
      raw['total_accrual_minor'] >= 0 &&
      orders.every((o) =>
          communityId(o['order_id']) &&
          o['mcn_accrual_minor'] is int &&
          o['mcn_accrual_minor'] >= 0 &&
          o['environment'] is String));
  if (owner) return raw;
  final own = assignments
      .where((r) => communityMap(r['data'])['account_id'] == accountId)
      .toList();
  final known = own
      .map((r) => communityMap(r['data'])['order_id'])
      .whereType<String>()
      .toSet();
  final scoped = orders.where((r) => known.contains(r['order_id'])).toList();
  return {
    ...raw,
    'relations': <Map<String, dynamic>>[],
    'assignments': own,
    'orders': scoped,
    'total_accrual_minor': scoped
        .where((r) => r['environment'] == 'PRODUCTION')
        .fold<int>(0, (sum, r) => sum + (r['mcn_accrual_minor'] as int)),
    'staff_scope_limited': true
  };
}

class EngagementPage extends StatelessWidget {
  const EngagementPage(
      {super.key,
      this.view = 'rankings',
      this.recordId,
      this.embedded = false});
  final String view;
  final String? recordId;
  final bool embedded;
  @override
  Widget build(BuildContext context) => CommunityGate(
      domain: 'engagement',
      route:
          '/engagement?view=$view${recordId == null ? '' : '&recordId=$recordId'}',
      title: '成长与合作',
      partyRequired: ![
        'rankings',
        'competition',
        'ranking',
        'buyers',
        'exposures'
      ].contains(view),
      embedded: embedded,
      builder: (s) => _Engagement(
          session: s, view: view, id: recordId, embedded: embedded));
}

class _Engagement extends StatefulWidget {
  const _Engagement(
      {required this.session,
      required this.view,
      this.id,
      required this.embedded});
  final AccountSession session;
  final String view;
  final String? id;
  final bool embedded;
  @override
  State<_Engagement> createState() => _EngagementState();
}

class _EngagementState extends CommunityPageState<_Engagement> {
  @override
  AccountSession get session => widget.session;
  @override
  String get domain => 'engagement';
  late final city = field(),
      district = field(),
      category = field(),
      person = field(widget.view == 'growth' ? widget.id ?? '' : ''),
      reason = field(),
      order = field(),
      employee = field(),
      expires = field(),
      booking = field(),
      reviewBody = field();
  String assignmentKind = 'BOOKING';
  bool optedIn = false,
      grantAgreed = false,
      buyerOptIn = false,
      reviewAgreed = false;
  int? realism, fit, completeness;
  List<String> reviewMedia = [];
  Map<String, dynamic>? reviewResult;
  final staffActions = <String>{};
  List<Map<String, dynamic>> rows = [], secondary = [], staff = [];
  Map<String, dynamic>? detail, voteUsage;
  List<Map<String, dynamic>> nominationProfiles = [];
  String? nominationProfile, nominationError;
  bool nominationReading = false, nominationAgreed = false,
      nominationUnknown = false;
  int nominationTicket = 0;
  Map<String, dynamic>? nominationResult;
  List<ArtistPerson> people = [];
  List<TradeRecord> orders = [];
  List<Map<String, dynamic>> members = [], bookings = [];
  final selectedPeople = <String>{};
  Map<String, String> publicNames = {};
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void clearPrivate() {
    rows = [];
    secondary = [];
    staff = [];
    nominationTicket++;
    nominationProfiles = [];
    nominationProfile = nominationError = null;
    nominationReading = nominationAgreed = nominationUnknown = false;
    nominationResult = null;
    detail = null;
    voteUsage = null;
    people = [];
    orders = [];
    members = [];
    bookings = [];
    selectedPeople.clear();
    publicNames = {};
    staffActions.clear();
    optedIn = false;
    grantAgreed = false;
    buyerOptIn = false;
    reviewAgreed = false;
    realism = null;
    fit = null;
    completeness = null;
    reviewMedia = [];
    reviewResult = null;
  }

  @override
  void fail(Object e) {
    super.fail(e);
    if (e is AccountError && e.status == 412) {
      grantAgreed = false;
      reviewAgreed = false;
    }
  }

  @override
  Future<void> recovered(Map<String, dynamic> value) async {
    if (value['kind'] == 'CANDIDATE') {
      setState(() {
        nominationResult = value;
        nominationUnknown = false;
        nominationAgreed = false;
      });
    }
    if (value['kind'] == 'ORDER_REVIEW') {
      communityRecord(value, kind: 'ORDER_REVIEW');
      setState(() {
        reviewResult = value;
        order.text = communityMap(value['data'])['order_id'];
        reviewAgreed = false;
      });
    }
    await load();
  }

  @override
  Future<void> load() async {
    final t = ++ticket;
    final growthRead = widget.view == 'growth',
        growthPerson = person.text,
        growthEpoch = session.epoch,
        growthParty = session.partyId;
    bool currentRead() => mounted && t == ticket &&
        (!growthRead || session.epoch == growthEpoch &&
            session.partyId == growthParty && person.text == growthPerson);
    nominationTicket++;
    nominationProfiles = [];
    nominationProfile = null;
    nominationAgreed = nominationReading = false;
    setState(() {
      checking = true;
      error = null;
      if (growthRead) {
        detail = null;
        secondary = [];
      }
    });
    try {
      Map<String, dynamic>? d;
      List<Map<String, dynamic>> r = [], extra = [], s = [];
      if (['growth', 'mcn'].contains(widget.view) && session.isOwner) {
        final list = <ArtistPerson>[], seen = <String>{};
        String? cursor;
        do {
          final page = await ArtistsApi(session).people(cursor: cursor);
          if (growthRead && !currentRead()) return;
          list.addAll(page.items);
          cursor = page.cursor;
          communityRequire(cursor == null || seen.add(cursor));
        } while (cursor != null);
        if (growthRead && !currentRead()) return;
        if (mounted && t == ticket) people = list;
      }
      if (['referrals', 'mcn', 'reviews'].contains(widget.view) &&
          session.isOwner) {
        orders = await TradeApi(session).all('ORDER');
      }
      if (widget.view == 'mcn' && session.isOwner) {
        final e = session.epoch, p = session.partyId;
        final m = await session.read('/api/v1/parties/$p/members',
            actingParty: p, query: {'limit': 100});
        final b = await session.read('/api/v1/auditions/records',
            actingParty: p, query: {'kind': 'BOOKING', 'limit': 100});
        communityRequire(session.epoch == e && session.partyId == p);
        members = communityItems(m)
            .where((r) => r['current_status'] == 'ACTIVE')
            .toList();
        bookings = communityItems(b);
      }
      if (widget.view == 'ranking' || widget.view == 'competition') {
        final id = communityRequiredId(widget.id ?? '', '记录');
        d = await api.read(
            '${widget.view == 'ranking' ? 'rankings' : 'competitions'}/$id',
            account: true);
        communityRequire(d['id'] == id &&
            (widget.view == 'ranking'
                ? d['boards'] is Map
                : d['candidates'] is List));
        final ids = widget.view == 'competition'
            ? communityRows(d['candidates']).map((x) => x['person_id']).toSet()
            : communityMap(d['boards'])
                .values
                .expand((v) => communityRows(v))
                .map((x) => x['person_id'])
                .toSet();
        final names = <String, String>{}, seen = <String>{};
        String? cursor;
        do {
          final page = await ArtistsApi(session)
              .catalog(city: d['city'], cursor: cursor);
          for (final listing in page.items) {
            if (ids.contains(listing['person_id'])) {
              names.putIfAbsent(
                  listing['person_id'], () => listing['display_name']);
            }
          }
          cursor = page.cursor;
          communityRequire(cursor == null || seen.add(cursor));
        } while (cursor != null && names.length < ids.length);
        if (mounted && t == ticket) publicNames = names;
        if (widget.view == 'competition' && canVote) {
          final votes = await api.read('votes', query: {'event_id': id});
          communityRequire(votes['event_id'] == id &&
              votes['used_today'] is int &&
              votes['used_today'] >= 0 &&
              votes['remaining_today'] is int &&
              votes['remaining_today'] >= 0 &&
              votes['points_per_vote'] ==
                  communityMap(d['rules'])['vote_cost']);
          extra = communityItems(votes);
          if (mounted && t == ticket) voteUsage = votes;
        }
      } else if (widget.view == 'buyers') {
        if (city.text.trim().isNotEmpty) {
          d = await api.read('buyers',
              account: true,
              query: {'city': communityRequired(city.text, '城市', max: 100)});
          validateBuyers(d);
        }
      } else if (widget.view == 'exposures') {
        if (city.text.trim().isNotEmpty) {
          r = communityItems(await api.read('exposures',
              account: true,
              query: {'city': communityRequired(city.text, '城市', max: 100)}));
          for (final x in r) {
            communityRequire(communityId(x['person_id']) &&
                communityId(x['event_id']) &&
                x['placement'] is String &&
                DateTime.tryParse('${x['ends_at']}') != null &&
                x['source'] == 'EARNED_REWARD_NOT_PAID_AD');
          }
          final page =
              await ArtistsApi(session).catalog(city: city.text.trim());
          if (mounted && t == ticket) {
            publicNames = {
              for (final x in page.items) x['person_id']: x['display_name']
            };
          }
        }
        if (session.isOwner) extra = communityItems(await api.read('rewards'));
      } else if (widget.view == 'reviews') {
        orders = orders
            .where((o) =>
                o.buyer == session.partyId &&
                o.status == 'PAID' &&
                communityMaybeMap(o.data['financial'])['net_minor'] is int &&
                communityMaybeMap(o.data['financial'])['net_minor'] > 0 &&
                (o.quote['stock_video'] is Map ||
                    o.quote['audition'] is Map ||
                    o.quote['customization'] is Map &&
                        o.quote['customization_change'] == null ||
                    o.quote['commercial'] is Map))
            .toList();
      } else if (widget.view == 'referrals') {
        r = communityItems(await api.read('referrals/records'));
      } else if (widget.view == 'mcn') {
        d = mcnDashboardForAccount(
            await api.read('mcn/dashboard'), session.account!['id'],
            owner: session.isOwner);
        communityRequire(d['orders'] is List &&
            d['assignments'] is List &&
            d['total_accrual_minor'] is int);
        if (session.isOwner) s = communityItems(await api.read('mcn/staff'));
      } else if (widget.view == 'growth') {
        if (!session.isOwner && growthPerson.isNotEmpty) {
          final id = communityRequiredId(growthPerson, '本次受派艺人');
          final raw = await session.read('/api/v1/artists/people/$id',
              actingParty: growthParty);
          api.check(growthEpoch, growthParty);
          if (!currentRead()) return;
          people = [ArtistDetail.parse(raw, id).person];
        }
        if (!currentRead()) return;
        if (growthPerson.isNotEmpty) {
          d = await api.read('growth',
              query: {'person_id': communityRequiredId(growthPerson, '本人艺人')});
        }
        if (!currentRead()) return;
        if (session.isOwner) extra = communityItems(await api.read('rewards'));
      } else if (city.text.trim().isNotEmpty &&
          district.text.trim().isNotEmpty &&
          category.text.trim().isNotEmpty) {
        r = communityItems(await api.read('rankings', account: true, query: {
          'city': city.text.trim(),
          'district': district.text.trim(),
          'category': category.text.trim()
        }));
        extra = communityItems(await api.read('competitions',
            account: true, query: {'city': city.text.trim()}));
      }
      if (currentRead()) {
        setState(() {
          detail = d;
          rows = r;
          secondary = extra;
          staff = s;
        });
      }
    } catch (e) {
      if (currentRead()) setState(() => fail(e));
    } finally {
      if (mounted && t == ticket) setState(() => checking = false);
    }
  }

  @override
  Future<void> reconcilePending() async {
    final p = recoverySuffix!, b = communityMap(recovery!['body']);
    if (p == 'candidates') {
      nominationUnknown = true;
      await api.read('competitions/${b['event_id']}', account: true);
      await api.read('profiles/mine');
      if (recovery!['resultId'] != null) {
        final result = await api.read('records/${recovery!['resultId']}');
        validateNomination(result, b);
      }
    } else if (p.startsWith('mcn/')) {
      await api.read('mcn/dashboard');
      if (session.isOwner) await api.read('mcn/staff');
    } else if (p == 'votes' || p == 'appeals') {
      await api.read('competitions/${b['event_id']}', account: true);
      await api.read('votes', query: {'event_id': b['event_id']});
    } else if (p == 'profiles') {
      await api.read('growth', query: {'person_id': b['person_id']});
    } else if (p == 'reviews') {
      await TradeApi(session).record(b['order_id']);
      if (recovery!['resultId'] != null) {
        await api.read('records/${recovery!['resultId']}');
      }
    } else if (p == 'buyer-city-profile') {
      await api.read('buyers', account: true, query: {'city': b['city']});
    } else {
      await api.read('referrals/records');
      if (b['order_id'] != null) await TradeApi(session).record(b['order_id']);
    }
  }

  Future<void> submit(Future<void> Function() work) async {
    try {
      await work();
    } catch (e) {
      if (mounted) setState(() => fail(e));
    }
  }

  void validateNomination(Map<String, dynamic> value, Map<String, dynamic> body) {
    final r = communityRecord(value, kind: 'CANDIDATE');
    communityRequire(r['owner_party_id'] == session.partyId &&
        r['parent_id'] == body['event_id'] &&
        communityMap(r['data'])['profile_id'] == body['profile_id'] &&
        communityId(communityMap(r['data'])['person_id']));
  }

  void Function(Map<String, dynamic>)? _recoverReceipt;

  void Function(Map<String, dynamic>)? receiptValidator(
      String suffix, Map<String, dynamic> input, int? version, String? party) {
    final revoke = RegExp(r'^mcn/staff/([0-9a-fA-F-]{36})/revoke$')
        .firstMatch(suffix);
    if (!['votes', 'appeals', 'mcn/staff', 'profiles', 'reviews',
        'referrals/sync', 'mcn/assignments', 'buyer-city-profile'].contains(suffix) &&
        revoke == null) return null;
    // Freeze the submitted body, not editable fields or a refreshed list.
    final body = communityMap(jsonDecode(jsonEncode(input)));
    bool sameSet(Object? actual, Object? expected, {bool ids = false}) {
      if (actual is! List || expected is! List || actual.isEmpty ||
          (ids && actual.length > 100) ||
          actual.any((x) => x is! String || (ids && !communityId(x))) ||
          expected.any((x) => x is! String || (ids && !communityId(x)))) return false;
      final a = actual.toSet(), b = expected.toSet();
      return a.length == actual.length && b.length == expected.length &&
          a.length == b.length && a.containsAll(b);
    }
    return (value) {
      const extraKinds = {
        'profiles': 'RANK_PROFILE', 'reviews': 'ORDER_REVIEW',
        'referrals/sync': 'REFERRAL_COMMISSION',
        'mcn/assignments': 'ASSIGNMENT',
        'buyer-city-profile': 'BUYER_PROFILE',
      };
      if (extraKinds.containsKey(suffix)) {
        final r = communityRecord(value, kind: extraKinds[suffix]);
        final data = communityMap(r['data']);
        communityRequire(communityId(party));
        if (suffix == 'referrals/sync') {
          final attribution = communityMap(data['attribution']);
          communityRequire(communityId(body['order_id']) &&
              r['parent_id'] == body['order_id'] &&
              data['order_id'] == body['order_id'] &&
              communityId(attribution['referrer_party_id']) &&
              communityId(attribution['buyer_party_id']) &&
              communityId(attribution['supplier_party_id']) &&
              r['owner_party_id'] == attribution['referrer_party_id'] &&
              [attribution['buyer_party_id'], attribution['supplier_party_id'],
                attribution['referrer_party_id']].contains(party) &&
              const ['PENDING', 'REVERSED', 'RULE_REVIEW_REQUIRED',
                'SIMULATION_EXCLUDED', 'PLATFORM_BUDGET_REVIEW_REQUIRED',
                'ACCRUED'].contains(r['current_status']));
        } else {
          communityRequire(r['owner_party_id'] == party);
          if (suffix == 'reviews') {
            communityRequire(communityId(body['order_id']) &&
                r['parent_id'] == body['order_id'] &&
                r['current_status'] == 'PUBLISHED' &&
                data['free_points_awarded'] == 0 &&
                communityDigest({for (final key in body.keys) key: data[key]}) ==
                    communityDigest(body));
          } else {
            communityRequire(r['parent_id'] == null);
            if (suffix == 'mcn/assignments') {
              final booking = body['booking_id'], order = body['order_id'];
              communityRequire(((communityId(booking) && order == null) ||
                    (communityId(order) && booking == null)) &&
                  communityId(body['account_id']) &&
                  r['current_status'] == 'ASSIGNED' &&
                  data['booking_id'] == booking && data['order_id'] == order &&
                  data['account_id'] == body['account_id']);
            } else {
              communityRequire(body['opt_in'] is bool &&
                  body['city'] is String &&
                  data['opt_in'] == body['opt_in'] && data['city'] == body['city']);
              if (suffix == 'profiles') {
                communityRequire(communityId(body['person_id']) &&
                    const ['ACTIVE', 'EXCLUDED'].contains(r['current_status']) &&
                    data['person_id'] == body['person_id'] &&
                    data['district'] == body['district'] &&
                    data['category'] == body['category']);
              } else {
                communityRequire(r['current_status'] == 'ACTIVE');
              }
            }
          }
        }
        return;
      }
      final kind = suffix == 'votes' ? 'VOTE'
          : suffix == 'appeals' ? 'APPEAL' : 'STAFF_GRANT';
      final r = communityRecord(value, kind: kind), data = communityMap(r['data']);
      communityRequire(communityId(party) && r['owner_party_id'] == party);
      if (suffix == 'votes' || suffix == 'appeals') {
        communityRequire(communityId(body['event_id']) &&
            r['parent_id'] == body['event_id']);
        if (suffix == 'votes') {
          communityRequire(r['current_status'] == 'VALID' &&
              communityId(body['candidate_id']) &&
              data['candidate_id'] == body['candidate_id'] &&
              data['points'] is int && data['points'] > 0 &&
              data['points'] <= 100000 &&
              communityId(data['hold_id']));
        } else {
          communityRequire(r['current_status'] == 'OPEN' &&
              body['reason'] is String && data['reason'] == body['reason']);
        }
      } else if (revoke != null) {
        communityRequire(communityId(revoke.group(1)) &&
            r['id'] == revoke.group(1) && r['parent_id'] == null &&
            r['current_status'] == 'REVOKED' && version != null &&
            r['object_version'] == version + 1 &&
            body['reason'] is String && data['reason'] == body['reason']);
      } else {
        final actualUntil = DateTime.tryParse('${data['valid_until']}');
        final expectedUntil = DateTime.tryParse('${body['valid_until']}');
        const actions = {'READ_PROFILE', 'COMMISSION_PRODUCTION',
          'MANAGE_AUDITIONS', 'MANAGE_MATERIALS', 'COMMERCIAL_MESSAGES',
          'READ_INCOME', 'MANAGE_LISTINGS'};
        communityRequire(r['current_status'] == 'ACTIVE' &&
            r['parent_id'] == null && communityId(body['account_id']) &&
            data['account_id'] == body['account_id'] &&
            sameSet(data['person_ids'], body['person_ids'], ids: true) &&
            sameSet(data['actions'], body['actions']) &&
            (data['actions'] as List).every(actions.contains) &&
            actualUntil != null && expectedUntil != null &&
            actualUntil.isAtSameMomentAs(expectedUntil));
      }
    };
  }

  Future<Map<String, dynamic>?> actBound(String suffix,
      Map<String, dynamic> body, {int? version, bool reload = true}) {
    final frozen = communityMap(jsonDecode(jsonEncode(body)));
    final validate = receiptValidator(suffix, frozen, version, session.partyId);
    return act(suffix, frozen, version: version, reload: reload, validate: validate);
  }

  @override
  Future<void> recover() async {
    if (recovery == null || recoverySuffix == null || !reconciled || busy) return;
    _recoverReceipt = receiptValidator(recoverySuffix!,
        communityMap(recovery!['body']), recovery!['version'] as int?, session.partyId);
    try {
      await super.recover();
    } finally {
      _recoverReceipt = null;
    }
  }

  @override
  Future<void> validateResult(Map<String, dynamic> value) async {
    communityRecord(value);
    _recoverReceipt?.call(value);
    if (recoverySuffix == 'candidates' && recovery != null) {
      validateNomination(value, communityMap(recovery!['body']));
    }
  }

  bool get nominationOpen {
    final end = DateTime.tryParse('${detail?['ends_at']}');
    return canVote && detail?['status'] == 'PUBLISHED' && end != null &&
        DateTime.now().isBefore(end);
  }

  Future<void> readNominationProfiles() async {
    if (!enabled || checking || nominationReading || !canVote) return;
    final event = detail?['id'], epoch = session.epoch, party = session.partyId,
        t = ++nominationTicket, page = ticket;
    bool current() => mounted && t == nominationTicket && page == ticket &&
        epoch == session.epoch && party == session.partyId && detail?['id'] == event;
    setState(() {
      nominationReading = true;
      nominationError = nominationProfile = null;
      nominationProfiles = [];
      nominationAgreed = false;
    });
    try {
      final data = await api.read('profiles/mine');
      if (!current()) return;
      final rows = communityItems(data), ids = <String>{};
      for (final row in rows) {
        communityRequire(communityId(row['id']) && ids.add(row['id']) &&
            communityId(row['person_id']) && ['city', 'district', 'category']
                .every((key) => row[key] is String &&
                    (row[key] as String).trim().isNotEmpty &&
                    (row[key] as String).length <= 100));
      }
      setState(() {
        nominationProfiles = rows.where((row) => ['city', 'district', 'category']
            .every((key) => row[key] == detail?[key])).toList();
        if (nominationProfiles.isEmpty) nominationError =
            '没有与本活动地域和类别匹配的本人有效档案；这不代表此前没有提交提名。';
      });
    } catch (e) {
      if (current()) setState(() => nominationError = communityError(e));
    } finally {
      if (mounted && t == nominationTicket) setState(() => nominationReading = false);
    }
  }

  Future<void> nominate() async {
    if (!enabled || checking || nominationReading || !nominationOpen ||
        !nominationAgreed || nominationUnknown || nominationResult != null) return;
    final selected = nominationProfiles.where((p) => p['id'] == nominationProfile)
        .firstOrNull;
    if (selected == null) return;
    final body = <String, dynamic>{'event_id': detail!['id'], 'profile_id': selected['id']};
    final epoch = session.epoch, party = session.partyId;
    final out = await act('candidates', body, reload: false, validate: (value) {
      validateNomination(value, body);
      communityRequire(communityMap(value['data'])['person_id'] == selected['person_id']);
    });
    if (!mounted || epoch != session.epoch || party != session.partyId) return;
    setState(() {
      nominationAgreed = false;
      if (out != null) nominationResult = out;
      if (recoverySuffix == 'candidates') nominationUnknown = true;
    });
  }

  Widget nominationSection() => tradeSection('本人提名参选', [
    const Text('仅使用本人有效参榜档案。提交后仍须候选资格审核，不代表入选、获奖或扣用投票晶钻。'),
    if (!canVote) const Text('请切换到本人个人身份再办理提名。'),
    if (nominationUnknown || recoverySuffix == 'candidates')
      const Text('原提名结果仍须核对。公开候选只列已审核者；活动截止后的恢复失败不代表从未提交，请保留原请求联系核对，勿另建重复申请。'),
    if (nominationResult != null) ...[
      communityFact('本次提名记录', communityShort(nominationResult!['id'])),
      communityFact('服务器状态', communityState(nominationResult!['current_status'])),
      tradeButton('读取本次提名记录', enabled ? () => Navigator.pushNamed(context,
          '/engagement/record?recordId=${nominationResult!['id']}') : null, outline: true),
    ],
    tradeButton('读取本人可用参榜档案', enabled && !checking && !nominationReading &&
        canVote ? readNominationProfiles : null, outline: true),
    if (nominationReading) const LinearProgressIndicator(),
    if (nominationError != null) appNotice(nominationError!),
    for (final profile in nominationProfiles)
      RadioListTile<String>(value: profile['id'], groupValue: nominationProfile,
          title: Text('${profile['city']} · ${profile['district']} · ${profile['category']}'),
          subtitle: Text('本人档案 ${communityShort(profile['id'])}'),
          onChanged: enabled && !checking && !nominationReading && !nominationUnknown &&
              nominationResult == null ? (value) => setState(() {
                nominationProfile = value; nominationAgreed = false;
              }) : null),
    communityCheck('我以本人身份提交选定档案提名，资格以本活动审核为准', nominationAgreed,
        enabled && !checking && !nominationReading && nominationOpen &&
            nominationProfile != null && !nominationUnknown && nominationResult == null
            ? (value) => setState(() => nominationAgreed = value == true) : null),
    tradeButton('提交本人提名', enabled && !checking && !nominationReading &&
        nominationOpen && nominationAgreed && nominationProfile != null &&
        !nominationUnknown && nominationResult == null ? nominate : null),
  ]);

  String artistName(Object? id) =>
      publicNames['$id'] ?? '公开名称暂未提供 · ${communityShort(id)}';
  bool get canVote => session.isOwner && session.party?['kind'] == 'PERSON';
  bool get votingOpen {
    final d = detail;
    if (d == null || voteUsage == null) return false;
    final start = DateTime.tryParse('${d['starts_at']}'),
        end = DateTime.tryParse('${d['ends_at']}'),
        now = DateTime.now();
    return canVote &&
        d['status'] == 'PUBLISHED' &&
        start != null &&
        end != null &&
        !now.isBefore(start) &&
        now.isBefore(end) &&
        voteUsage!['remaining_today'] > 0;
  }

  bool get appealsOpen {
    final d = detail;
    final deadline = DateTime.tryParse('${d?['appeal_until']}');
    return session.isOwner &&
        session.partyId != null &&
        d?['status'] == 'PUBLISHED' &&
        deadline != null &&
        DateTime.now().isBefore(deadline);
  }

  bool get ownProfile =>
      session.isOwner &&
      people.any((p) => p.id == person.text && p.owner == session.partyId);
  Future<void> vote(Map<String, dynamic> candidate) async {
    if (!mounted || !enabled || checking || !votingOpen) return;
    final d = detail!, rules = communityMap(d['rules']);
    final epoch = session.epoch, party = session.partyId, readTicket = ticket;
    final eventId = d['id'], candidateId = candidate['id'];
    // The public projection has no object_version. Bind consent to this read
    // generation and its actual event/candidate data, not an invented version.
    final eventSnapshot = jsonEncode(d), candidateSnapshot = jsonEncode(candidate);
    if (!communityRows(d['candidates']).any((r) =>
        r['id'] == candidateId && jsonEncode(r) == candidateSnapshot)) return;
    final yes = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
                title: const Text('确认本次投票'),
                content: Text(
                    '本次扣用${rules['vote_cost']}晶钻。今日上限${rules['daily_cap']}次，以服务器核对为准。'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c, false),
                      child: const Text('返回')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, true),
                      child: const Text('确认扣分并投票'))
                ]));
    if (yes != true || !mounted) return;
    final current = detail;
    if (epoch != session.epoch || party != session.partyId ||
        readTicket != ticket || !enabled || checking || !votingOpen ||
        current == null || current['id'] != eventId ||
        jsonEncode(current) != eventSnapshot ||
        !communityRows(current['candidates']).any((r) =>
            r['id'] == candidateId && jsonEncode(r) == candidateSnapshot)) return;
    await actBound('votes', {'event_id': eventId, 'candidate_id': candidateId});
  }

  Widget menu() => Wrap(spacing: 8, runSpacing: 8, children: [
        for (final x in [
          ('rankings', '艺人榜单'),
          ('growth', '我的成长'),
          ('referrals', '推荐记录'),
          ('mcn', '机构经营'),
          ('buyers', '同城出品与机构'),
          ('reviews', '订单评价'),
          ('exposures', '真实曝光')
        ])
          ChoiceChip(
              label: Text(x.$2),
              selected: widget.view == x.$1,
              onSelected: !enabled || checking ? null : (_) {
                if (widget.view != x.$1) Navigator.pushReplacementNamed(
                    context, '/engagement?view=${x.$1}');
              })
      ]);
  List<Widget> rankingIndex() => [
        communityHeading('在作品中成长', '每一份排名和成长，都有实际订单与评价依据。'),
        menu(),
        const SizedBox(height: 20),
        communityField(city, '城市'),
        communityField(district, '区县'),
        communityField(category, '艺人类别'),
        tradeButton('读取对应榜单', enabled ? load : null),
        if (rows.isEmpty && !checking && error == null)
          appNotice('选择城市、区县和类别后读取已发布榜单。没有记录时不会编造名次。'),
        for (final r in rows)
          tradeSection(
              '${communityText(r['city'])} · ${communityText(r['category'])}', [
            communityFact('榜单时间', communityDate(r['at'])),
            tradeButton(
                '查看六类榜单',
                () => Navigator.pushNamed(
                    context, '/engagement?view=ranking&recordId=${r['id']}'),
                outline: true),
            communityRecordId(r)
          ]),
        for (final r in secondary)
          tradeSection(communityText(r['title']), [
            communityFact('月冠军', communityState(r['status'])),
            communityFact('投票截止', communityDate(r['ends_at'])),
            tradeButton(
                '规则、投票和结果',
                () => Navigator.pushNamed(context,
                    '/engagement?view=competition&recordId=${r['id']}'),
                outline: true)
          ])
      ];
  List<Widget> rankingDetail() {
    final d = detail;
    if (d == null) return [];
    final boards = communityMap(d['boards']);
    return [
      communityHeading('艺人榜单', '按发布时的业务事实形成快照，排名不代表付费推广。'),
      RankingExplanation(session: session, id: widget.id!),
      communityFact('统计时间', communityDate(d['at'])),
      for (final b in [
        ('sales', '成交榜'),
        ('levels', '等级榜'),
        ('repeat', '复购榜'),
        ('reviews', '评价榜'),
        ('composite', '综合榜'),
        ('newcomers', '新人榜'),
        ('popularity', '人气榜')
      ])
        if (boards.containsKey(b.$1))
          tradeSection(b.$2, [
            if (communityRows(boards[b.$1]).isEmpty)
              const Text('当前条件不足，暂无可公布名次。'),
            for (final (i, r) in communityRows(boards[b.$1]).indexed)
              Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('第${i + 1}位',
                            style: const TextStyle(
                                fontSize: 22, fontWeight: FontWeight.bold)),
                        communityFact('当前公开艺人', artistName(r['person_id'])),
                        communityFact(
                            b.$1 == 'sales'
                                ? '成交净额'
                                : b.$1 == 'levels'
                                    ? '累计成长'
                                    : b.$1 == 'repeat'
                                        ? '复购比例'
                                        : b.$1 == 'reviews'
                                            ? '有效评分'
                                            : b.$1 == 'popularity'
                                                ? '人气记录'
                                                : '榜单分值',
                            b.$1 == 'sales'
                                ? communityMoney(r['gmv'])
                                : b.$1 == 'levels'
                                    ? r['growth_points']
                                    : b.$1 == 'repeat' &&
                                            r['repeat_rate'] is num
                                        ? '${((r['repeat_rate'] as num) * 100).toStringAsFixed(2)}%'
                                        : b.$1 == 'reviews'
                                            ? r['bayesian_rating']
                                            : b.$1 == 'popularity'
                                                ? r['popularity']
                                                : b.$1 == 'newcomers'
                                                    ? r['newcomer_score']
                                                    : r['score']),
                        communityFact('有效订单', r['orders']),
                        communityFact('成长等级', r['level'])
                      ]))
          ]),
      communityRecordId(d)
    ];
  }

  List<Widget> competitionDetail() {
    final d = detail;
    if (d == null) return [];
    final rules = communityMap(d['rules']),
        result = communityMaybeMap(d['result']);
    final candidateSection = GlobalKey(),
        progressSection = GlobalKey(),
        resultSection = GlobalKey(),
        rulesSection = GlobalKey();
    void scrollTo(GlobalKey key) {
      final target = key.currentContext;
      if (target != null) Scrollable.ensureVisible(target,
          duration: const Duration(milliseconds: 240));
    }
    return [Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      tradeHeading(communityText(d['title']),
          eyebrow: '月冠评选 / 已发布活动', fontSize: 24),
      Container(
          padding: const EdgeInsets.all(18),
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(color: AccountTheme.surface,
              borderRadius: BorderRadius.circular(18)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('本期当前阶段',
                style: TextStyle(color: AccountTheme.muted, fontSize: 12)),
            const SizedBox(height: 8),
            Text(communityState(d['status']),
                style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            Text(result.isNotEmpty
                ? '已返回核定结果；结果不等于奖项已经兑现。'
                : votingOpen
                    ? '请核对规则和扣用晶钻，再确认本次投票。'
                    : '当前不可投票，请核对真实状态、时间及本人剩余次数。',
                style: const TextStyle(color: AccountTheme.muted, height: 1.6)),
          ])),
      Wrap(spacing: 8, runSpacing: 8, children: [
        OutlinedButton(onPressed: () => scrollTo(candidateSection),
            child: const Text('候选艺人')),
        OutlinedButton(onPressed: () => scrollTo(progressSection),
            child: const Text('评选进度')),
        OutlinedButton(onPressed: result.isEmpty ? null : () => scrollTo(resultSection),
            child: const Text('本期结果')),
      ]),
      const SizedBox(height: 20),
      nominationSection(),
      Container(key: progressSection, child: tradeSection('评选时间与进度', [
        communityFact('01 · 开始时间', communityDate(d['starts_at'])),
        communityFact('02 · 投票截止', communityDate(d['ends_at'])),
        communityFact('03 · 异议截止', communityDate(d['appeal_until'])),
        const Text('以上为本期实际时间；不以步骤样式推定某阶段已经完成。',
            style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
      ])),
      Container(key: rulesSection, child: tradeSection('本次规则', [
        communityFact('每次投票', '${rules['vote_cost']} 晶钻'),
        communityFact('每日上限', '${rules['daily_cap']}次'),
        if (voteUsage != null) ...[
          communityFact('今日已用次数', voteUsage!['used_today']),
          communityFact('今日还可投票', voteUsage!['remaining_today'])
        ],
        communityFact(
            '同分处理',
            rules['tie_mode'] == 'MANUAL_REVIEW'
                ? '独立人工复核，不按付费随机决定'
                : rules['tie_mode']),
        communityFact(
            '争议晶钻',
            rules['void_point_policy'] == 'HOLD_FOR_APPEAL'
                ? '争议期间保留原扣分，按复核决定另行返还'
                : rules['void_point_policy']),
        communityFact('榜单 / 投票 / 专业评分权重',
            '${rules['ranking_bps']} / ${rules['vote_bps']} / ${rules['official_bps']}（万分比）'),
        appNotice('每日次数、可用晶钻、候选状态和活动时间由服务器重新核对。')
      ])),
      Container(key: candidateSection, child: tradeHeading('本期候选', fontSize: 22)),
      if (communityRows(d['candidates']).isEmpty)
        appNotice('本期尚未返回候选名单，不展示示例艺人或推算名次。'),
      for (final r in communityRows(d['candidates']))
        Container(
            padding: const EdgeInsets.symmetric(vertical: 16),
            decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AccountTheme.border))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Container(width: 60, height: 80,
                    decoration: BoxDecoration(color: AccountTheme.surface,
                        borderRadius: BorderRadius.circular(10)),
                    child: const Icon(Icons.person_outline, color: AccountTheme.muted)),
                const SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(artistName(r['person_id']),
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  const Text('本期候选', style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
                  communityFact('榜单分值', r['ranking_score']),
                ])),
              ]),
              tradeButton('确认本次扣分投票', enabled && votingOpen ? () => vote(r) : null,
                  outline: true),
            ])),
      tradeSection('我的投票记录', [
        if (secondary.isEmpty) const Text('尚无本次投票记录。'),
        for (final r in secondary)
          communityFact(communityState(r['current_status']),
              '${communityMaybeMap(r['data'])['points']} 晶钻')
      ]),
      if (result.isNotEmpty)
        Container(key: resultSection, child: tradeSection('已核定结果', [
          communityFact('核定时间', communityDate(result['at'])),
          communityFact('冠军艺人', artistName(result['winner_person_id'])),
          for (final r in communityRows(result['scores']))
            communityFact('艺人 ${artistName(r['person_id'])}',
                '总分 ${r['total']} · 有效票 ${r['votes']}')
        ])),
      if (!canVote) appNotice('投票按本人个人身份与实际晶钻办理，请先切换到本人身份再核对。'),
      if (!appealsOpen) appNotice('仅公示期间且在异议截止前可提交说明，请核对当前状态与截止时间。'),
      communityField(reason, '异议说明', lines: 3, enabled: enabled && appealsOpen),
      tradeButton(
          '提交本次活动异议',
          enabled && appealsOpen
              ? () => submit(() async {
                    if (!appealsOpen) {
                      throw const AccountError(409, 'APPEAL_CLOSED');
                    }
                    await actBound('appeals', {
                      'event_id': d['id'],
                      'reason': communityRequired(reason.text, '异议原因')
                    });
                  })
              : null,
          outline: true),
      tradeButton('返回本期规则', () => scrollTo(rulesSection), outline: true),
      tradeSection('结果、异议与兑现', [
        const Text('核定结果与奖项兑现分别办理。异议仅在公示及截止条件满足时提交；争议不自动退款，按原规则与复核结果处理。',
            style: TextStyle(color: AccountTheme.muted, height: 1.6)),
        const SizedBox(height: 8),
        const Text('结果未确定时先恢复原请求，不重复扣用晶钻。退出公开展示也不删除历史投票与账务记录。',
            style: TextStyle(color: AccountTheme.muted, height: 1.6)),
      ]),
      communityRecordId(d)
    ])];
  }

  List<Widget> growthView() {
    final account = communityMaybeMap(detail?['account']),
        g = communityMaybeMap(account['data']);
    final rule = communityMaybeMap(
        communityMaybeMap(communityMaybeMap(g['rule_snapshot'])['data'])['rule']);
    final thresholds = rule['thresholds'];
    final points = g['growth_points'];
    num? nextThreshold;
    if (points is num && points.isFinite && points >= 0 &&
        thresholds is List && thresholds.isNotEmpty &&
        thresholds.every((value) => value is num && value.isFinite && value >= 0)) {
      final ordered = thresholds.cast<num>().toList()..sort();
      for (final value in ordered) {
        if (value > points) {
          nextThreshold = value;
          break;
        }
      }
    }
    final delegated = widget.id != null &&
        (!session.isOwner ||
            people
                .any((p) => p.id == person.text && p.owner != session.partyId));
    return [
      tradeHeading(delegated ? '受托艺人成长' : '成长与好评',
          eyebrow: '成长轨迹 / 服务评价', fontSize: 24),
      menu(),
      const SizedBox(height: 20),
      communitySelect(
          delegated ? '本次受托艺人' : '本人艺人',
          person.text,
          [for (final p in people) (p.id, '${p.name} · 版本${p.version}')],
          enabled ? (v) => setState(() {
            if (person.text == (v ?? '')) return;
            person.text = v ?? '';
            ticket++;
            detail = null;
            secondary = [];
            error = null;
            checking = false;
          }) : null),
      tradeButton('读取本人成长', enabled ? () => submit(load) : null),
      if (detail == null)
        appNotice(checking ? '正在读取当前所选艺人的成长记录。' :
            '请读取当前所选艺人的成长记录；未读取成功前不展示等级或进度。'),
      if (detail != null && account.isEmpty)
        appNotice('本艺人尚无已核算成长账户，不展示示例等级或进度。'),
      if (account.isNotEmpty)
        Container(
            padding: const EdgeInsets.all(20),
            margin: const EdgeInsets.symmetric(vertical: 16),
            decoration: BoxDecoration(color: AccountTheme.surface,
                borderRadius: BorderRadius.circular(18)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('当前成长等级', style: TextStyle(
                  fontSize: 12, color: AccountTheme.muted)),
              const SizedBox(height: 12),
              Text(communityText(g['level']),
                  style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w700)),
              const Divider(height: 28),
              communityFact('累计成长', g['growth_points']),
              communityFact('近期成长', g['recent_growth_points']),
              if (nextThreshold != null && points is num) ...[
                const SizedBox(height: 12),
                LinearProgressIndicator(value: (points / nextThreshold).clamp(0.0, 1.0).toDouble()),
                const SizedBox(height: 8),
                Text('$points / $nextThreshold · 下一累计成长门槛',
                    style: const TextStyle(fontSize: 12, color: AccountTheme.muted)),
                const Text('按本账户原规则门槛展示；实际等级仍以服务器核定及保级规则为准。',
                    style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
              ],
              const SizedBox(height: 12),
              const Text('仅来自服务器已记录的业务事实，不等于认证等级、钱包晶钻或可提现收入。',
                  style: TextStyle(fontSize: 12, height: 1.6, color: AccountTheme.muted)),
            ])),
      if (account.isNotEmpty)
        tradeSection('成长核算记录', [
          communityFact('核算时间', communityDate(g['at'])),
          communityFact('已取得等级', g['earned_level']),
          communityFact('当前核定等级', g['level']),
          communityRecordId(account),
          const Text('这是当前成长账户记录，不是独立考核报告，也不代表累计完成订单数。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
        ]),
      if (detail != null)
        tradeSection('成长规则与星光', [
          communityFact('星光值',
              g['starlight_configured'] == true ? g['starlight'] : '规则尚未配置'),
          communityFact('成长说明', g['demoted'] == true ? '当前有降级记录' : '按当前规则核对'),
          if (g['rule_snapshot'] is Map)
            communityFact(
                '原规则说明',
                communityMaybeMap(communityMaybeMap(
                        g['rule_snapshot'])['data'])['rule'] is Map
                    ? communityMap(
                        communityMap(communityMap(g['rule_snapshot'])['data'])[
                            'rule'])['terms']
                    : null)
        ]),
      if (detail != null)
        tradeSection('星光记录', [
          appNotice('星光单独记录，不作为可支付晶钻或可提现余额。'),
          for (final r in communityRows(detail!['starlight_entries']))
            tradeSection(
                '原订单 ${communityShort(communityMap(r['data'])['order_id'])}', [
              communityFact('本项星光', communityMap(r['data'])['amount']),
              communityFact(
                  '进展',
                  communityMap(r['data'])['voided'] == true
                      ? '原订单退款或排除后已冲回'
                      : '依已核实的原订单记录'),
              if (session.isOwner)
                tradeButton(
                    '核对这笔原订单',
                    () => Navigator.pushNamed(context,
                        '/trade/record?recordId=${communityMap(r['data'])['order_id']}'),
                    outline: true),
              communityRecordId(r)
            ])
        ]),
      if (ownProfile)
        tradeSection('榜单公开设置', [
          communityField(city, '公开城市'),
          communityField(district, '公开区县'),
          communityField(category, '公开类别'),
          communityCheck('允许我的艺人资料按有效授权参加公开榜单', optedIn,
              enabled ? (v) => setState(() => optedIn = v == true) : null),
          tradeButton(
              '保存本次公开选择',
              enabled
                  ? () => submit(() async {
                        await actBound('profiles', {
                          'person_id': communityRequiredId(person.text, '本人艺人'),
                          'city': communityRequired(city.text, '城市', max: 100),
                          'district':
                              communityRequired(district.text, '区县', max: 100),
                          'category':
                              communityRequired(category.text, '类别', max: 100),
                          'opt_in': optedIn
                        });
                      })
                  : null,
              outline: true)
        ]),
      tradeSection('认证、成长与服务评价', [
        const Text('认证光环核对身份与材料；业务成长依据实际业务记录；服务评价反映具体订单体验。三个维度独立，不能互相替代。',
            style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
        tradeButton('查看本人认证档案',
            enabled ? () => Navigator.pushNamed(context, '/artists') : null,
            outline: true),
        if (session.isOwner)
          tradeButton('查看本人订单与评价',
              enabled ? () => Navigator.pushNamed(context, '/engagement?view=reviews') : null,
              outline: true),
      ]),
      if (detail != null)
        tradeSection('已取得奖励', [
        if (secondary.isEmpty) const Text('暂无奖励记录。'),
        for (final r in secondary)
          tradeSection(
              communityText(communityMaybeMap(r['data'])['title']), [
            communityFact('进展', communityState(r['current_status'])),
            communityFact(
                '已登记安排',
                communityMaybeMap(r['data'])['delivery'] is Map
                    ? communityMaybeMap(
                        communityMaybeMap(r['data'])['delivery'])['placement']
                    : '尚无实际交付记录'),
            communityFact('原奖励条款', communityMaybeMap(r['data'])['terms']),
            communityFact('有效截止',
                communityDate(communityMaybeMap(r['data'])['valid_until'])),
            if (r['current_status'] == 'REDEEMED')
              tradeButton(
                  '明确领取这份奖励证明',
                  enabled
                      ? () => savePrivate(
                          'rewards/${r['id']}/file', 'my-reward-${r['id']}.bin')
                      : null,
                  outline: true),
            communityRecordId(r)
          ])
      ])
    ];
  }

  List<Widget> referralsView() => [
        communityHeading('推荐与回报', '只记录一级推荐。计提、冲回和实际到账分别核对。'),
        menu(),
        const SizedBox(height: 20),
        for (final r in rows)
          tradeSection(
              '原订单 ${communityShort(communityMaybeMap(r['data'])['order_id'])}',
              [
                communityFact('状态', communityState(r['current_status'])),
                communityFact(
                    '应计金额',
                    communityMoney(
                        communityMaybeMap(r['data'])['amount_minor'])),
                communityFact(
                    '退款冲回',
                    communityMaybeMap(r['data'])['delta_minor'] is int &&
                            communityMaybeMap(r['data'])['delta_minor'] < 0
                        ? communityMoney(
                            -(communityMaybeMap(r['data'])['delta_minor']
                                as int))
                        : '当前未记录冲回差额'),
                ...sixFacts(
                    communityMaybeMap(r['data'])['attribution'], '本单冻结的一级推荐归因'),
                appNotice('此处是平台返佣义务记录，不代表已经转账到账。'),
                communityRecordId(r)
              ]),
        if (rows.isEmpty) appNotice('暂无属于当前身份的推荐返佣记录。'),
        tradeSection('核对推荐归因', [
          appNotice(
              '建立推荐来源需要当前生效规则与服务方安全目录，当前接口尚未提供可选来源。可先核对已有原订单的归因、退款冲回和应计结果。'),
          communitySelect(
              '我的原订单',
              order.text,
              [
                for (final r in orders.where((r) => r.quote['referral'] is Map))
                  (
                    r.id,
                    '${r.title} · ${communityState(r.status)} · 版本${r.version}'
                  )
              ],
              enabled ? (v) => setState(() => order.text = v ?? '') : null),
          for (final original in orders.where((r) => r.id == order.text))
            ...sixFacts(original.quote['referral'], '原订单的直接推荐约定'),
          tradeButton(
              '核对该订单推荐结果',
              enabled && order.text.isNotEmpty
                  ? () => submit(() async {
                        await actBound('referrals/sync', {
                          'order_id': communityRequiredId(order.text, '原订单')
                        });
                      })
                  : null,
              outline: true)
        ])
      ];
  List<Widget> mcnView() {
    final d = detail;
    return [
      communityHeading('机构经营', '具体艺人、受托范围和每笔原单保持清楚。'),
      menu(),
      const SizedBox(height: 20),
      if (d != null)
        tradeSection('经营与收入', [
          communityFact(session.isOwner ? '正式环境应计' : '本页受派订单应计',
              communityMoney(d['total_accrual_minor'])),
          appNotice('应计收入并非实际出款；换绑机构不改写原合同与历史记录。'),
          if (d['staff_scope_limited'] == true)
            appNotice('本页仅显示有效艺人授权范围内、已明确派给你的订单；这里的金额不代表全机构收入。'),
          if (d['truncated'] == true)
            appNotice('记录较多，当前展示有数量上限；完整核对请在机构网页工作台办理。'),
          for (final r in communityRows(d['orders']))
            tradeSection('订单 ${communityShort(r['order_id'])}', [
              communityFact('订单进展', communityState(r['status'])),
              communityFact('本机构应计', communityMoney(r['mcn_accrual_minor'])),
              communityFact('资金环境', r['environment'])
            ]),
          for (final r in communityRows(d['assignments']))
            communityFact('已派工作人员',
                communityShort(communityMaybeMap(r['data'])['account_id']))
        ]),
      for (final r in staff)
        tradeSection('员工受托范围', [
          communityFact('工作人员',
              communityShort(communityMaybeMap(r['data'])['account_id'])),
          communityFact(
              '截止', communityDate(communityMaybeMap(r['data'])['valid_until'])),
          communityFact('状态', communityState(r['current_status'])),
          communityFact(
              '可办事项',
              (communityMaybeMap(r['data'])['actions'] as List? ?? [])
                  .map((a) =>
                      const {
                        'READ_PROFILE': '读取资料',
                        'COMMISSION_PRODUCTION': '代办制作',
                        'MANAGE_AUDITIONS': '管理试镜',
                        'MANAGE_MATERIALS': '管理艺人材料',
                        'COMMERCIAL_MESSAGES': '商单消息',
                        'READ_INCOME': '读取收入',
                        'MANAGE_LISTINGS': '管理上架'
                      }[a] ??
                      a)
                  .join('、')),
          if (session.isOwner && r['current_status'] == 'ACTIVE')
            tradeButton(
                '撤回这份员工委托',
                enabled
                    ? () => submit(() async {
                          final epoch = session.epoch, party = session.partyId,
                              generation = ticket;
                          final id = r['id'], version = r['object_version'],
                              hash = r['content_sha256'];
                          bool current() => mounted && epoch == session.epoch &&
                              party == session.partyId && generation == ticket &&
                              enabled && !checking && session.isOwner &&
                              staff.any((item) => item['id'] == id &&
                                  item['object_version'] == version &&
                                  item['content_sha256'] == hash &&
                                  item['current_status'] == 'ACTIVE');
                          if (!current()) return;
                          final why = await _reasonDialog('撤回员工委托');
                          if (why == null || !current()) return;
                          await actBound('mcn/staff/$id/revoke', {'reason': why},
                              version: version);
                        })
                    : null,
                outline: true)
        ]),
      if (d != null)
        for (final r in communityRows(d['assignments']))
          if (communityId(communityMaybeMap(r['data'])['person_id']))
            tradeButton(
                '核对这笔派单艺人的受托成长资料',
                enabled
                    ? () => Navigator.pushNamed(context,
                        '/engagement?view=growth&recordId=${communityMaybeMap(r['data'])['person_id']}')
                    : null,
                outline: true),
      if (session.isOwner)
        tradeSection('明确员工委托与派单', [
          communitySelect(
              '本机构有效成员',
              employee.text,
              [
                for (final r in members)
                  (
                    r['account_id'] as String,
                    '${r['role_code'] == 'OWNER' ? '负责人' : '成员'} · ${communityShort(r['account_id'])} · 版本${r['object_version']}'
                  )
              ],
              enabled ? (v) => setState(() => employee.text = v ?? '') : null),
          for (final p in people.where((p) => p.owner != session.partyId))
            communityCheck(
                '${p.name} · 版本${p.version}',
                selectedPeople.contains(p.id),
                enabled
                    ? (v) => setState(() => v == true
                        ? selectedPeople.add(p.id)
                        : selectedPeople.remove(p.id))
                    : null),
          communityDateField(context, expires, '委托截止',
              enabled: enabled,
              onChanged: () => setState(() => grantAgreed = false)),
          for (final x in [
            ('READ_PROFILE', '读取资料'),
            ('COMMISSION_PRODUCTION', '代办制作'),
            ('MANAGE_AUDITIONS', '管理试镜'),
            ('MANAGE_MATERIALS', '管理艺人材料'),
            ('COMMERCIAL_MESSAGES', '商单消息'),
            ('READ_INCOME', '读取收入'),
            ('MANAGE_LISTINGS', '管理上架')
          ])
            communityCheck(
                x.$2,
                staffActions.contains(x.$1),
                enabled
                    ? (v) => setState(() => v == true
                        ? staffActions.add(x.$1)
                        : staffActions.remove(x.$1))
                    : null),
          communityCheck('我已核对具体艺人、员工身份、允许事项和有效期', grantAgreed,
              enabled ? (v) => setState(() => grantAgreed = v == true) : null),
          tradeButton(
              '确认本次员工委托',
              enabled &&
                      grantAgreed &&
                      selectedPeople.isNotEmpty &&
                      employee.text.isNotEmpty &&
                      staffActions.isNotEmpty
                  ? () => submit(() async {
                        await actBound('mcn/staff', {
                          'account_id':
                              communityRequiredId(employee.text, '有效成员'),
                          'person_ids': selectedPeople.toList(),
                          'actions': staffActions.toList(),
                          'valid_until': communityInstant(expires.text, '委托截止')
                        });
                        setState(() => grantAgreed = false);
                      })
                  : null,
              outline: true),
          communitySelect(
              '派单类型',
              assignmentKind,
              [('BOOKING', '试镜预约'), ('ORDER', '商业合作订单')],
              enabled
                  ? (v) => setState(() {
                        assignmentKind = v!;
                        booking.clear();
                      })
                  : null),
          communitySelect(
              '本机构原业务',
              booking.text,
              assignmentKind == 'BOOKING'
                  ? [
                      for (final r in bookings)
                        (
                          r['id'] as String,
                          '${communityMaybeMap(communityMaybeMap(r['data'])['offer'])['title'] ?? '试镜预约'} · ${communityState(r['current_status'])} · 版本${r['object_version']}'
                        )
                    ]
                  : [
                      for (final r in orders.where((r) => communityMaybeMap(
                              communityMaybeMap(r.data['quote'])['commercial'])[
                          'relation'] is Map))
                        (r.id, '${r.title} · 版本${r.version}')
                    ],
              enabled ? (v) => setState(() => booking.text = v ?? '') : null),
          tradeButton(
              '派给该工作人员',
              enabled
                  ? () => submit(() async {
                        await actBound('mcn/assignments', {
                          'account_id':
                              communityRequiredId(employee.text, '有效成员'),
                          'booking_id': assignmentKind == 'BOOKING'
                              ? communityRequiredId(booking.text, '原试镜预约')
                              : null,
                          'order_id': assignmentKind == 'ORDER'
                              ? communityRequiredId(booking.text, '原订单')
                              : null
                        });
                      })
                  : null,
              outline: true)
        ])
    ];
  }

  List<Widget> buyersView() => [
        tradeHeading('谁在找戏', eyebrow: '同城出品人与机构 / 公开选择', fontSize: 28),
        menu(),
        const SizedBox(height: 20),
        tradeSection('本城公开出品人与机构', [
          const Text('个人与机构分别按真实公开记录展示。是否排名及核算数值以本次返回的有效规则为准，不把当前名单当高消费筛选结果。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
        ]),
        const SizedBox(height: 16),
        communityField(city, '所在城市'),
        tradeButton('读取同城名单', enabled ? load : null),
        if (detail == null) appNotice('请先选择城市，读取当前公开名单。'),
        if (detail != null) ...[
          appNotice(detail!['ranking_enabled'] == true
              ? '以下顺序为服务器按已生效规则与核实消费事实形成的排名。'
              : '当前未配置出品排名规则；以下是公开名单，展示顺序不代表名次。'),
          for (final group in [
            ('personal', '同城出品人'),
            ('organizations', '同城机构')
          ])
            tradeSection(group.$2, [
              if (communityRows(detail![group.$1]).isEmpty)
                const Text('当前没有已同意公开的相关主体。'),
              for (final (i, r) in communityRows(detail![group.$1]).indexed)
                Container(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    decoration: const BoxDecoration(border: Border(
                        bottom: BorderSide(color: AccountTheme.border))),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      LayoutBuilder(builder: (context, constraints) {
                        final compact = constraints.maxWidth < 300 ||
                            MediaQuery.textScalerOf(context).scale(14) / 14 > 1.2;
                        final caption = Column(
                            crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${r['party_id'] == session.partyId ? communityText(session.party?['display_name']) : '已公开主体 ${communityShort(r['party_id'])}'}',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 8),
                          Text(r['facts_available'] == true
                              ? '已核实完成订单 ${r['completed_orders']} · 净付款 ${communityMoney(r['verified_net_paid_minor'])}'
                              : '核算依据尚未配置',
                              style: const TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.5)),
                          if (compact && detail!['ranking_enabled'] == true)
                            Text('第${i + 1}名', style: const TextStyle(color: AccountTheme.accent)),
                        ]);
                        final portrait = Container(width: 60, height: 80,
                            color: AccountTheme.surface,
                            child: Icon(group.$1 == 'personal' ? Icons.person_outline : Icons.business_outlined,
                                color: AccountTheme.muted));
                        if (compact) {
                          return Column(crossAxisAlignment: CrossAxisAlignment.start,
                              children: [portrait, const SizedBox(height: 8), caption]);
                        }
                        return Row(children: [
                          portrait,
                          const SizedBox(width: 12),
                          Expanded(child: caption),
                          if (detail!['ranking_enabled'] == true) ...[
                            const SizedBox(width: 8),
                            Text('第${i + 1}名', style: const TextStyle(color: AccountTheme.accent)),
                          ],
                        ]);
                      }),
                      const SizedBox(height: 12),
                      if (group.$1 != 'personal')
                        appNotice('机构不使用个人晶钻钱包；机构订单与核实付款独立计入。'),
                      if (r['compliance_clear'] != true)
                        appNotice('合规记录：有记录需复核。'),
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: const Text('核算与合规详情', style: TextStyle(fontSize: 14)),
                        children: [
                      communityFact(
                          '核实的完成订单',
                          r['facts_available'] == true
                              ? r['completed_orders']
                              : '核算依据尚未配置'),
                      communityFact(
                          '核实净付款',
                          r['facts_available'] == true
                              ? communityMoney(r['verified_net_paid_minor'])
                              : '核算依据尚未配置'),
                      if (group.$1 == 'personal') ...[
                        communityFact('消费成长', r['consumption_growth']),
                        communityFact(
                            '星探资格',
                            r['scout_active'] == true
                                ? '当前有效 · 第${r['scout_level']}级'
                                : '当前未生效')
                      ],
                      if (detail!['ranking_enabled'] == true)
                        communityFact('本次排名分值', r['score']),
                      communityFact('合规记录',
                          r['compliance_clear'] == true ? '当前已核对' : '有记录需复核'),
                        ],
                      ),
                      tradeButton(
                          '查看已公开资料',
                          () => Navigator.pushNamed(
                              context,
                              Uri(path: '/producers/public', queryParameters: {
                                'partyId': r['party_id'] as String,
                                'city': city.text.trim()
                              }).toString()),
                          outline: true)
                    ]))
            ])
        ],
        tradeSection('投稿与沟通', [
          const Text('投稿是单向合作意向。请先进入主体的公开通告，核对具体用途、接收条件和本人授权；不开放陌生主体间自由私信。',
              style: TextStyle(fontSize: 12, color: AccountTheme.muted, height: 1.6)),
        ]),
        if (session.isOwner)
          tradeSection('本人公开选择', [
            communityCheck('同意当前办事身份在所选城市名单中公开', buyerOptIn,
                enabled ? (v) => setState(() => buyerOptIn = v == true) : null),
            tradeButton(
                '保存本次公开选择',
                enabled
                    ? () => submit(() async {
                          await actBound(
                              'buyer-city-profile',
                              {
                                'city': communityRequired(city.text, '城市',
                                    max: 100),
                                'opt_in': buyerOptIn
                              });
                        })
                    : null,
                outline: true),
            appNotice('未勾选后保存表示不参加公开名单。本人选择不会替其他人或机构授权。')
          ])
      ];
  Widget reviewSubmitAction() => tradeButton(
            '发布本次订单评价',
            enabled &&
                    reviewAgreed &&
                    realism != null &&
                    fit != null &&
                    completeness != null &&
                    reviewMedia.length <= 10 &&
                    reviewResult == null &&
                    orders.any((o) => o.id == order.text)
                ? () => submit(() async {
                      final selected = communityRequiredId(order.text, '本人原订单');
                      final body = {
                        'order_id': selected,
                        'realism': realism,
                        'fit': fit,
                        'completeness': completeness,
                        'body': communityRequired(reviewBody.text, '本次评价',
                            max: 2000),
                        'media_asset_ids': List<String>.from(reviewMedia)
                      };
                      final result = await actBound('reviews', body, reload: false);
                      if (result != null && mounted) {
                        setState(() {
                          reviewResult = result;
                          reviewAgreed = false;
                          notice = '本次评价已按原订单发布；评价奖励仍未开放。';
                        });
                      }
                    })
                : null);

  List<Widget> reviewsView() => [
        tradeHeading('写下这次体验', eyebrow: '完成一次合作 / 按原订单评价', fontSize: 28),
        menu(),
        const SizedBox(height: 20),
        appNotice(
            '仅可评价正式环境、已履约、无争议、净付款大于0的本人订单。提交时服务器重新核对，已付款选项本身不代表履约条件已经满足。评价奖励尚未开放，不发放评价晶钻，也不要求先开通钱包。'),
        tradeSection('本次原订单', [
          communitySelect(
            '本人已付款原订单',
            order.text,
            [
              for (final o in orders)
                (
                  o.id,
                  '${o.title} · 净付款${communityMoney(communityMaybeMap(o.data['financial'])['net_minor'])} · 版本${o.version}'
                )
            ],
            enabled
                ? (v) => setState(() {
                      order.text = v ?? '';
                      reviewResult = null;
                      reviewAgreed = false;
                    })
                : null),
        if (orders.isEmpty && !checking && error == null)
          const Text('当前没有可选择的本人已付款业务订单。'),
          for (final selected in orders.where((item) => item.id == order.text)) ...[
            const SizedBox(height: 12),
            Text(selected.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            communityFact('净付款', communityMoney(communityMaybeMap(selected.data['financial'])['net_minor'])),
            communityFact('原单版本', selected.version),
          ],
        ]),
        const SizedBox(height: 8),
        const Text('这次合作的三个维度', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        const Text('逐项选择星级，认证等级与成长不代替服务评价。',
            style: TextStyle(fontSize: 12, color: AccountTheme.muted)),
        for (final x in [
          ('realism', '真实感'),
          ('fit', '契合度'),
          ('completeness', '完整度')
        ])
          Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(x.$2, style: const TextStyle(fontSize: 14)),
                const SizedBox(height: 8),
                Wrap(spacing: 4, children: [
                  for (var score = 1; score <= 5; score++)
                    IconButton(
                        tooltip: '${x.$2} $score 分',
                        onPressed: enabled ? () => setState(() {
                          switch (x.$1) {
                            case 'realism':
                              realism = score;
                            case 'fit':
                              fit = score;
                            case 'completeness':
                              completeness = score;
                          }
                          reviewAgreed = false;
                        }) : null,
                        icon: Icon(
                            score <= ({'realism': realism, 'fit': fit,
                                'completeness': completeness}[x.$1] ?? 0)
                                ? Icons.star_rounded : Icons.star_border_rounded,
                            color: AccountTheme.accent, size: 28)),
                ]),
              ])),
        communityField(reviewBody, '本次履约的具体评价', lines: 4),
        tradeSection('本人评价附图或证明（可不上传）', [
          SupplyFiles(
              api: SupplyApi(session),
              purpose: 'REVIEW_EVIDENCE',
              ids: reviewMedia,
              enabled: enabled,
              onChanged:
                  enabled ? (v) => setState(() => reviewMedia = v) : null)
        ]),
        communityCheck('我已完成本订单的实际验收，以上评分和内容反映这次真实体验', reviewAgreed,
            enabled ? (v) => setState(() => reviewAgreed = v == true) : null),
        if (widget.embedded) reviewSubmitAction(),
        if (reviewResult != null)
          tradeSection('本次已发布评价', [
            communityFact(
                '真实感', communityMap(reviewResult!['data'])['realism']),
            communityFact('契合度', communityMap(reviewResult!['data'])['fit']),
            communityFact(
                '完整度', communityMap(reviewResult!['data'])['completeness']),
            SelectableText(
                communityText(communityMap(reviewResult!['data'])['body'])),
            communityRecordId(reviewResult!)
          ]),
        if (order.text.isNotEmpty)
          tradeButton(
              '核对这笔原订单',
              () => Navigator.pushNamed(
                  context, '/trade/record?recordId=${order.text}'),
              outline: true)
      ];
  List<Widget> exposuresView() => [
        communityHeading('真实曝光安排', '仅显示当前已经登记且正在生效的奖励资源位。'),
        menu(),
        const SizedBox(height: 20),
        const ActivitySummaryCard(
            label: '曝光资源', value: '按实际兑现展示',
            icon: Icons.visibility_outlined,
            description: '获得奖励不等于已开始曝光。这里只显示当前生效记录，安排与截止时间需逐项核对。'),
        communityField(city, '所在城市'),
        tradeButton('读取当前生效曝光', enabled ? load : null),
        if (rows.isEmpty && !checking && error == null)
          Semantics(
              container: true,
              label: '当前所选城市暂无生效曝光记录。',
              excludeSemantics: true,
              child: appNotice('当前所选城市暂无生效曝光记录。')),
        for (final r in rows)
          tradeSection(artistName(r['person_id']), [
            communityFact('资源位', r['placement']),
            communityFact('曝光截止', communityDate(r['ends_at'])),
            communityFact('来源', '实际取得的奖励，非付费广告排序'),
            for (final own in secondary.where((x) =>
                communityMap(x['data'])['event_id'] == r['event_id'] &&
                communityMap(x['data'])['person_id'] == r['person_id'] &&
                communityMap(x['data'])['delivery'] is Map))
              communityFact(
                  '本人已登记曝光开始',
                  communityDate(communityMap(
                      communityMap(own['data'])['delivery'])['starts_at'])),
            if (!secondary.any((x) =>
                communityMap(x['data'])['event_id'] == r['event_id'] &&
                communityMap(x['data'])['person_id'] == r['person_id'] &&
                communityMap(x['data'])['delivery'] is Map))
              appNotice('公开摘要确认当前生效并提供截止时间，未提供开始日期。'),
            tradeButton(
                '查看对应活动的实际结果',
                () => Navigator.pushNamed(context,
                    '/engagement?view=competition&recordId=${r['event_id']}'),
                outline: true)
          ]),
        for (final own in secondary.where((x) =>
            communityMap(x['data'])['kind'] == 'EXPOSURE' &&
            communityMap(x['data'])['delivery'] is Map))
          tradeSection('本人的已登记曝光', [
            communityFact(
                '资源位',
                communityMap(
                    communityMap(own['data'])['delivery'])['placement']),
            communityFact(
                '开始',
                communityDate(communityMap(
                    communityMap(own['data'])['delivery'])['starts_at'])),
            communityFact(
                '结束',
                communityDate(communityMap(
                    communityMap(own['data'])['delivery'])['ends_at'])),
            communityFact('登记进展', communityState(own['current_status']))
          ])
      ];
  Future<String?> _reasonDialog(String title) async {
    final c = TextEditingController(text: reason.text);
    final value = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
                title: Text(title),
                content: TextField(
                    controller: c,
                    decoration: const InputDecoration(labelText: '明确原因'),
                    maxLines: 3),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('返回')),
                  FilledButton(
                      onPressed: () {
                        if (c.text.trim().isNotEmpty) {
                          Navigator.pop(ctx, c.text.trim());
                        }
                      },
                      child: const Text('确认提交'))
                ]));
    c.dispose();
    return value;
  }

  @override
  Widget build(BuildContext context) {
    final body = <Widget>[
      ...feedback,
      ...switch (widget.view) {
        'ranking' => rankingDetail(),
        'competition' => competitionDetail(),
        'growth' => growthView(),
        'referrals' => referralsView(),
        'mcn' => mcnView(),
        'buyers' => buyersView(),
        'reviews' => reviewsView(),
        'exposures' => exposuresView(),
        _ => rankingIndex()
      },
      tradeButton('重新读取当前结果', busy ? null : load, outline: true)
    ];
    return widget.embedded
        ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: body)
        : tradeScaffold(context, '成长与合作', body,
            locked: recovery != null || widget.view == 'reviews' && busy,
            footer: widget.view == 'reviews' ? reviewSubmitAction() : null);
  }
}

void validateBuyers(Map<String, dynamic> d) {
  communityRequire(d['city'] is String &&
      d['ranking_enabled'] is bool &&
      d['organization_wallet_enabled'] == false &&
      d['source'] == 'VERIFIED_CONSUMPTION_ONLY');
  for (final key in ['personal', 'organizations']) {
    for (final r in communityRows(d[key])) {
      communityRequire(communityId(r['party_id']) &&
          r['party_kind'] == (key == 'personal' ? 'PERSON' : 'ORGANIZATION') &&
          r['completed_orders'] is int &&
          r['completed_orders'] >= 0 &&
          r['verified_net_paid_minor'] is int &&
          r['verified_net_paid_minor'] >= 0 &&
          r['facts_available'] is bool &&
          r['scout_active'] is bool &&
          r['scout_level'] is int &&
          r['compliance_clear'] is bool &&
          (key != 'personal' ||
              r['consumption_growth'] is int && r['consumption_growth'] >= 0) &&
          (d['ranking_enabled'] != true || r['score'] is num));
    }
  }
}
