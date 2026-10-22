import 'package:flutter/material.dart';
import '../engagement/community_support.dart';
import '../account/account_session.dart';
import '../account/account_api.dart';
import '../artists/artists_api.dart';
import '../artists/artists_models.dart';
import '../account/app_visual.dart';

Map<String, dynamic> cocreationSupplyConsent(Object? raw, String party) {
  final r = communityMap(raw),
      d = communityMap(r['data']),
      c = communityMap(d['consent']);
  bool texts(Object? value, {bool ids = false}) =>
      value is List &&
      value.isNotEmpty &&
      value.length <= 100 &&
      value.toSet().length == value.length &&
      value.every((x) => ids
          ? communityId(x)
          : x is String && x.trim().isNotEmpty && x.length <= 100);
  final start = DateTime.tryParse('${c['valid_from']}'),
      end = DateTime.tryParse('${c['valid_until']}');
  communityRequire(communityId(r['id']) &&
      r['kind'] == 'CONSENT' &&
      communityId(r['owner_party_id']) &&
      communityId(r['created_by']) &&
      communityId(r['stream_ref']) &&
      r['revision'] is int &&
      r['revision'] > 0 &&
      r['object_version'] is int &&
      r['object_version'] > 0 &&
      [
        'PENDING_REVIEW',
        'APPROVED',
        'CHANGES_REQUESTED',
        'REJECTED',
        'WITHDRAWN'
      ].contains(r['current_status']) &&
      communityId(c['avatar_id']) &&
      communityId(c['subject_party_id']) &&
      (r['owner_party_id'] == party || c['subject_party_id'] == party) &&
      texts(c['features']) &&
      (c['features'] as List).every((x) => ['FACE', 'VOICE'].contains(x)) &&
      texts(c['purposes']) &&
      texts(c['territories']) &&
      texts(c['evidence_asset_ids'], ids: true) &&
      c['terms'] is String &&
      c['terms'].trim().isNotEmpty &&
      c['terms'].length <= 8000 &&
      start != null &&
      end != null &&
      start.isBefore(end));
  if (r['current_status'] == 'APPROVED') {
    final review = communityMap(d['review']);
    communityRequire(review['decision'] == 'APPROVED' &&
        communityId(review['reviewer_account_id']) &&
        review['reason'] is String &&
        review['reason'].trim().isNotEmpty &&
        DateTime.tryParse('${review['recorded_at']}') != null &&
        d['withdrawal'] == null);
  }
  return r;
}

Future<List<Map<String, dynamic>>> cocreationSupplyConsents(
    AccountSession session) async {
  final api = ArtistsApi(session),
      party = api.owner(),
      epoch = session.epoch,
      rows = <Map<String, dynamic>>[],
      seen = <String>{};
  if (session.supplyAccessDenied) {
    throw const AccountError(403, 'SUPPLY_OWNER_REQUIRED');
  }
  String? cursor;
  do {
    final page = await session.read('/api/v1/supply/records',
        actingParty: party,
        query: {
          'kind': 'CONSENT',
          'limit': 20,
          if (cursor != null) 'cursor': cursor
        });
    api.check(epoch, party);
    communityRequire(page['next_cursor'] == null ||
        communityId(page['next_cursor']) && seen.add(page['next_cursor']));
    rows.addAll(
        communityItems(page).map((r) => cocreationSupplyConsent(r, party)));
    cursor = page['next_cursor'];
  } while (cursor != null);
  communityRequire(rows.map((r) => r['id']).toSet().length == rows.length);
  return rows;
}

class CocreationCastInput {
  CocreationCastInput(TextEditingController Function([String]) create,
      {Map<String, dynamic>? initial}) {
    final v = initial ?? <String, dynamic>{};
    person = create('${v['person_id'] ?? ''}');
    avatar = create('${v['avatar_id'] ?? ''}');
    supplyConsent = create('${v['supply_consent_id'] ?? ''}');
    look = create('${v['look_version_id'] ?? ''}');
    voice = create('${v['voice_version_id'] ?? ''}');
    consents = create((v['artist_consent_ids'] as List? ?? []).join('\n'));
    usage = '${v['usage'] ?? 'EXISTING_MATERIAL'}';
  }
  late final TextEditingController person,
      avatar,
      supplyConsent,
      look,
      voice,
      consents;
  String usage = 'EXISTING_MATERIAL';
  Map<String, dynamic> value() {
    final ids = communityIds(consents.text, '脸声用途同意');
    if (ids.length > 2) throw const AccountError(400, '每次最多选择两份脸声用途同意');
    if (!['EXISTING_MATERIAL', 'NEW_GENERATION'].contains(usage)) {
      throw const AccountError(400, '请选定本次素材用途');
    }
    return {
      'person_id': communityRequiredId(person.text, '本人真人'),
      'avatar_id': communityRequiredId(avatar.text, '本人数字人'),
      'supply_consent_id': communityRequiredId(supplyConsent.text, '作品使用授权'),
      'artist_consent_ids': ids,
      'look_version_id': communityRequiredId(look.text, '造型版本'),
      'voice_version_id': voice.text.trim().isEmpty
          ? null
          : communityRequiredId(voice.text, '声音版本'),
      'usage': usage
    };
  }

  Widget chooser(AccountSession session,
          {required bool enabled, required VoidCallback changed}) =>
      CocreationCastChooser(
          session: session, input: this, enabled: enabled, onChanged: changed);
}

class CocreationCastChooser extends StatefulWidget {
  const CocreationCastChooser(
      {super.key,
      required this.session,
      required this.input,
      required this.enabled,
      required this.onChanged});
  final AccountSession session;
  final CocreationCastInput input;
  final bool enabled;
  final VoidCallback onChanged;
  @override
  State<CocreationCastChooser> createState() => _CocreationCastChooserState();
}

class _CocreationCastChooserState extends State<CocreationCastChooser> {
  List<ArtistPerson> people = [];
  ArtistDetail? person;
  List<ArtistRecord> records = [];
  List<Map<String, dynamic>> supply = [];
  bool busy = false;
  String? error;
  int ticket = 0;
  CocreationCastInput get input => widget.input;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    ticket++;
    super.dispose();
  }

  Future<void> load({String? personId}) async {
    final t = ++ticket, e = widget.session.epoch, p = widget.session.partyId;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final api = ArtistsApi(widget.session),
          all = <ArtistPerson>[],
          seen = <String>{};
      String? cursor;
      do {
        final page = await api.people(cursor: cursor);
        all.addAll(page.items.where((x) => x.owner == p && x.adultVerified));
        cursor = page.cursor;
        if (cursor != null) communityRequire(seen.add(cursor));
      } while (cursor != null);
      final selected = personId ?? input.person.text;
      ArtistDetail? d;
      final rs = <ArtistRecord>[];
      List<Map<String, dynamic>> ss = [];
      if (all.any((x) => x.id == selected)) {
        d = await api.person(selected);
        for (final kind in ['LOOK', 'VOICE', 'CONSENT']) {
          rs.addAll(await api.allRecords(selected, kind));
        }
        ss = await cocreationSupplyConsents(widget.session);
      }
      if (!mounted ||
          t != ticket ||
          widget.session.epoch != e ||
          widget.session.partyId != p) {
        return;
      }
      setState(() {
        people = all;
        person = d;
        records = rs;
        supply = ss;
      });
      if (d == null) {
        input.person.clear();
        input.avatar.clear();
        input.look.clear();
        input.voice.clear();
        input.supplyConsent.clear();
        input.consents.clear();
      }
      widget.onChanged();
    } catch (e) {
      if (mounted && t == ticket) {
        setState(() {
          people = [];
          person = null;
          records = [];
          supply = [];
          error = communityError(e);
        });
      }
    } finally {
      if (mounted && t == ticket) setState(() => busy = false);
    }
  }

  void choose(TextEditingController c, String? value) {
    c.text = value ?? '';
    widget.onChanged();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.enabled && !busy, avatar = input.avatar.text;
    final approved = records
        .where((x) =>
            x.kind == 'CONSENT' &&
            x.status == 'APPROVED' &&
            (x.avatarId == null || x.avatarId == avatar))
        .toList();
    final supplyChoices = supply
        .where((x) =>
            x['current_status'] == 'APPROVED' &&
            communityMaybeMap(communityMaybeMap(x['data'])['consent'])[
                    'subject_party_id'] ==
                widget.session.partyId &&
            communityMaybeMap(
                    communityMaybeMap(x['data'])['consent'])['avatar_id'] ==
                avatar)
        .toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (busy) const LinearProgressIndicator(),
      if (error != null) appNotice(error!),
      if (people.isEmpty && !busy)
        appNotice('尚无属于当前本人的艺人资料。请先在艺人档案中登记本人、素材与用途授权。'),
      communitySelect(
          '本人艺人',
          input.person.text,
          [for (final p in people) (p.id, '${p.name} · 版本${p.version}')],
          enabled
              ? (v) {
                  input.person.text = v ?? '';
                  input.avatar.clear();
                  input.look.clear();
                  input.voice.clear();
                  input.supplyConsent.clear();
                  input.consents.clear();
                  load(personId: v);
                }
              : null),
      communitySelect(
          '本人数字人',
          avatar,
          [for (final a in person?.avatars ?? <ArtistAvatar>[]) (a.id, a.name)],
          enabled
              ? (v) {
                  input.look.clear();
                  input.voice.clear();
                  input.supplyConsent.clear();
                  input.consents.clear();
                  choose(input.avatar, v);
                }
              : null),
      for (final kind in ['LOOK', 'VOICE'])
        communitySelect(
            kind == 'LOOK' ? '已登记造型版本' : '声音版本（可不使用）',
            kind == 'LOOK' ? input.look.text : input.voice.text,
            [
              if (kind == 'VOICE') ('', '不使用声音'),
              for (final r in records.where((x) =>
                  x.kind == kind &&
                  x.avatarId == avatar &&
                  x.status == 'RECORDED'))
                (r.id, '${r.data['display_name']} · 第${r.data['revision']}版')
            ],
            enabled
                ? (v) => choose(kind == 'LOOK' ? input.look : input.voice, v)
                : null),
      communitySelect(
          '已审核的作品使用授权',
          input.supplyConsent.text,
          [
            for (final r in supplyChoices)
              (
                r['id'] as String,
                '${communityMaybeMap(communityMaybeMap(r['data'])['consent'])['terms']} · 版本${r['object_version']}'
              )
          ],
          enabled ? (v) => choose(input.supplyConsent, v) : null),
      const Text('逐项选择本次使用的脸声同意，最多两份。'),
      for (final r in approved)
        communityCheck(
            '${(r.data['features'] as List).map((x) => artistFeatures[x] ?? x).join(' / ')} · ${(r.data['purposes'] as List).map((x) => artistPurposes[x] ?? x).join('、')} · 有效至${communityDate(r.data['valid_until'])}',
            input.consents.text.split('\n').contains(r.id),
            enabled
                ? (v) {
                    final ids = input.consents.text
                        .split('\n')
                        .where((x) => x.isNotEmpty)
                        .toSet();
                    if (v == true) {
                      if (ids.length >= 2) return;
                      ids.add(r.id);
                    } else {
                      ids.remove(r.id);
                    }
                    choose(input.consents, ids.join('\n'));
                  }
                : null),
      communitySelect(
          '本次素材用途',
          input.usage,
          [('EXISTING_MATERIAL', '使用已有素材'), ('NEW_GENERATION', '生成新的表演')],
          enabled
              ? (v) {
                  input.usage = v!;
                  widget.onChanged();
                  setState(() {});
                }
              : null),
      TextButton(
          onPressed: enabled ? load : null, child: const Text('重新核对本人资料与授权'))
    ]);
  }
}
