import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../supply/supply_api.dart';
import 'project_models.dart';

class ProjectPage {
  ProjectPage(this.items, this.cursor);
  final List<ProjectRecord> items;
  final String? cursor;
}

class ProjectsApi {
  ProjectsApi(this.session);
  final AccountSession session;
  String owner() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.projectsAccessDenied ||
        session.partyId == null ||
        !session.isOwner ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'PROJECT_PARTY_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String? party) {
    if (epoch != session.epoch || (party != null && party != owner())) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  Future<ProjectCatalogue> catalogue() async {
    final epoch = session.epoch;
    final d = await session.read('/api/v1/projects/catalogue');
    check(epoch, null);
    return ProjectCatalogue.parse(d);
  }

  Future<ProjectRecord> record(String id, {String? kind}) async {
    if (!projectIsId(id)) throw const AccountError(400, 'INVALID_ID');
    final p = owner(), epoch = session.epoch;
    final d =
        await session.read('/api/v1/projects/records/$id', actingParty: p);
    check(epoch, p);
    return ProjectRecord.parse(d, id: id, kind: kind);
  }

  Future<ProjectPage> page(
      {String? projectId, String? kind, String? cursor}) async {
    if (projectId != null &&
        (!ProjectRecord.projectIdValid(projectId) ||
            !projectKinds
                .skip(1)
                .where((k) => k != 'CHANNEL')
                .contains(kind))) {
      throw const AccountError(400, 'INVALID_LIST');
    }
    final p = owner(), epoch = session.epoch;
    final d = projectMap(
        await session.read(
            projectId == null
                ? '/api/v1/projects/projects'
                : '/api/v1/projects/projects/$projectId/records',
            actingParty: p,
            query: {
              'limit': 20,
              if (kind != null) 'kind': kind,
              if (cursor != null) 'cursor': cursor
            }),
        keys: ['items', 'next_cursor']);
    check(epoch, p);
    projectRequire(d['next_cursor'] == null ||
        ProjectRecord.projectIdValid(d['next_cursor']) &&
            d['next_cursor'] != cursor);
    final rows = projectList(d['items'])
        .map((r) => ProjectRecord.parse(r,
            kind: projectId == null ? 'PROJECT' : kind, projectId: projectId))
        .toList();
    projectRequire(rows.map((r) => r.id).toSet().length == rows.length);
    return ProjectPage(rows, d['next_cursor']);
  }

  Future<List<ProjectRecord>> all(String id, String kind) async {
    final rows = <ProjectRecord>[], seen = <String>{};
    String? cursor;
    do {
      final r = await page(projectId: id, kind: kind, cursor: cursor);
      rows.addAll(r.items);
      cursor = r.cursor;
      if (cursor != null) projectRequire(seen.add(cursor));
    } while (cursor != null);
    return {for (final r in rows) r.id: r}.values.toList();
  }

  Future<List<Map<String, dynamic>>> confirmations(ProjectRecord r) async {
    final p = owner(), epoch = session.epoch;
    final d = await session
        .read('/api/v1/projects/records/${r.id}/confirmations', actingParty: p);
    check(epoch, p);
    return projectConfirmationRows(d);
  }

  Future<Map<String, dynamic>> readiness(String id) async {
    final p = owner(), epoch = session.epoch;
    final d = projectMap(
        await session.read('/api/v1/projects/projects/$id/readiness',
            actingParty: p),
        keys: ['current_status', 'reason_code']);
    check(epoch, p);
    projectRequire(['AVAILABLE', 'BLOCKED'].contains(d['current_status']) &&
        (d['current_status'] == 'AVAILABLE'
            ? d['reason_code'] == null
            : projectText(d['reason_code'], 128)));
    return d;
  }

  Map<String, dynamic>? pending(String path) =>
      session.pending('POST', path, actingParty: owner());
  Future<ProjectRecord> write(String path, Map<String, dynamic> body,
      {required int version, String? kind}) async {
    final p = owner(), epoch = session.epoch;
    final d = await session.write('POST', path,
        actingParty: p, body: body, version: version, validate: (raw) async {
      final r = ProjectRecord.parse(raw, kind: kind);
      check(epoch, p);
      final targetId = path.split('/')[5];
      if (path.endsWith('/applications')) {
        projectRequire(r.owner == p && r.data['role_id'] == targetId);
      } else if (path.endsWith('/responses') || path.endsWith('/decisions')) {
        projectRequire(r.owner == p && r.id == targetId);
      } else if (path.endsWith('/releases')) {
        projectRequire(r.owner == p &&
            r.projectId == targetId &&
            r.data['channel_id'] == body['channel_id'] &&
            r.data['prior_release_id'] == body['prior_release_id']);
      } else if (path.endsWith('/external-events')) {
        projectRequire(r.owner == p && r.data['release_id'] == targetId);
      } else {
        projectRequire(r.id == targetId);
      }
      if (path.endsWith('/confirmations')) {
        final evidence = await confirmations(r);
        check(epoch, p);
        // The command returns the unchanged record. Only this exact hash and
        // party decision in the separate confirmation list proves success.
        if (!evidence.any((c) =>
            c['party_id'] == p &&
            c['content_sha256'] == body['content_sha256'] &&
            c['decision'] == body['decision'] &&
            c['reason'] == body['reason'])) {
          throw const AccountError(503, 'CONFIRMATION_RESULT_UNKNOWN',
              uncertain: true);
        }
      }
    });
    check(epoch, p);
    return ProjectRecord.parse(d, kind: kind);
  }

  Future<ProjectRecord> retry(String path) async {
    final op = pending(path);
    if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
    final parts = path.split('/');
    if (path.endsWith('/applications')) {
      // Before commit, a potential actor can only read the public role
      // summary. A private ROLE read would incorrectly revoke recovery.
      final public = await catalogue();
      final own = await page();
      if (op['resultId'] != null) await record(op['resultId']);
      for (final p in public.items.where((p) =>
          p['kind'] == 'PROJECT' &&
          (p['roles'] as List).any((r) => r['id'] == parts[5]))) {
        if (own.items.any((r) => r.id == p['id'])) {
          await all(p['id'], 'CANDIDATE');
        }
      }
      return write(path, projectMap(op['body']),
          version: op['version'], kind: 'CANDIDATE');
    }
    final target = await record(parts[5]);
    if (op['resultId'] != null && op['resultId'] != target.id) {
      await record(op['resultId']);
    }
    if (path.endsWith('/confirmations')) {
      await confirmations(target);
    } else if (target.kind == 'PROJECT') {
      await all(
          target.id, path.endsWith('/releases') ? 'RELEASE' : 'CANDIDATE');
    } else if (target.projectId != null &&
        !(target.kind == 'CANDIDATE' &&
            ['DECLINED', 'REJECTED', 'WITHDRAWN'].contains(target.status))) {
      await all(
          target.projectId!,
          target.kind == 'ROLE'
              ? 'CANDIDATE'
              : target.kind == 'RELEASE'
                  ? 'EXTERNAL_EVENT'
                  : 'CANDIDATE');
    }
    return write(path, projectMap(op['body']),
        version: op['version'],
        kind: path.endsWith('/applications') ||
                path.endsWith('/responses') ||
                path.endsWith('/decisions')
            ? 'CANDIDATE'
            : path.endsWith('/releases')
                ? 'RELEASE'
                : path.endsWith('/external-events')
                    ? 'EXTERNAL_EVENT'
                    : target.kind);
  }

  Future<ProjectRecord> apply(
          Map<String, dynamic> role, Map<String, dynamic> body) =>
      write('/api/v1/projects/roles/${role['id']}/applications', body,
          version: role['object_version'], kind: 'CANDIDATE');
  Future<ProjectRecord> respond(ProjectRecord r, Map<String, dynamic> body) =>
      write('/api/v1/projects/candidates/${r.id}/responses', body,
          version: r.version, kind: 'CANDIDATE');
  Future<ProjectRecord> candidateDecision(
      ProjectRecord r, String decision, String reason) {
    if (r.kind != 'CANDIDATE' ||
        r.owner != owner() ||
        !['CONFIRM', 'WITHDRAW'].contains(decision) ||
        decision == 'CONFIRM' && r.status != 'SELECTED') {
      throw const AccountError(403, 'CANDIDATE_NOT_AUTHORIZED');
    }
    return write('/api/v1/projects/candidates/${r.id}/decisions',
        {'decision': decision, 'content_sha256': r.hash, 'reason': reason},
        version: r.version, kind: 'CANDIDATE');
  }

  Future<ProjectRecord> confirm(ProjectRecord r, ProjectRecord project,
      List<Map<String, dynamic>> rows, String decision, String reason) {
    if (!projectCanConfirm(r, project, owner(), rows) ||
        !['APPROVED', 'REJECTED'].contains(decision)) {
      throw const AccountError(409, 'CONFIRMATION_PREDECESSOR_REQUIRED');
    }
    return write('/api/v1/projects/records/${r.id}/confirmations',
        {'content_sha256': r.hash, 'decision': decision, 'reason': reason},
        version: r.version, kind: r.kind);
  }

  Future<Uint8List> evidence(ProjectRecord r, String id) async {
    final p = owner(), epoch = session.epoch;
    final ids = [
      r.data['evidence_asset_id'],
      ...(r.data['material_asset_ids'] as List? ?? []),
      ...(r.data['rights'] as List? ?? []).map((v) => v['evidence_asset_id'])
    ];
    if (!ids.contains(id)) {
      throw const AccountError(403, 'EVIDENCE_NOT_ATTACHED');
    }
    final fresh = await record(r.id);
    if (fresh.owner != p) {
      throw const AccountError(403, 'PROJECT_EVIDENCE_FORBIDDEN');
    }
    final meta = await SupplyApi(session).asset(id);
    final bytes = await session.readBytes(
        '/api/v1/projects/records/${r.id}/evidence/$id',
        actingParty: p);
    check(epoch, p);
    if (bytes.length != meta['byte_size'] ||
        sha256.convert(bytes).toString() != meta['content_sha256']) {
      throw const AccountError(503, 'PRIVATE_CONTENT_MISMATCH');
    }
    return bytes;
  }

  Future<List<Map<String, dynamic>>> supplyChoices(String kind) async {
    final p = owner(),
        epoch = session.epoch,
        rows = <Map<String, dynamic>>[],
        seen = <String>{};
    String? cursor;
    do {
      final d = projectMap(
          await session.read('/api/v1/supply/records', actingParty: p, query: {
            'kind': kind,
            'limit': 20,
            if (cursor != null) 'cursor': cursor
          }),
          keys: ['items', 'next_cursor']);
      check(epoch, p);
      for (final v in projectList(d['items'])) {
        final r = projectMap(v, keys: [
          'id',
          'kind',
          'stream_ref',
          'revision',
          'owner_party_id',
          'created_by',
          'current_status',
          'object_version',
          'data'
        ]);
        projectRequire(r['kind'] == kind &&
            r['owner_party_id'] == p &&
            projectIsId(r['id']) &&
            projectInt(r['object_version'], min: 1) &&
            projectInt(r['revision'], min: 1) &&
            projectText(r['stream_ref'], 128) &&
            projectIsId(r['created_by']));
        final data = projectMap(r['data']);
        if (kind == 'AVATAR') {
          projectMap(data, keys: [
            'display_name',
            'material_asset_ids',
            'provider_asset_ref'
          ]);
          projectRequire(projectText(data['display_name'], 120) &&
              data['provider_asset_ref'] == null &&
              r['current_status'] == 'RECORDED');
          projectIds(data['material_asset_ids'], min: 1, max: 100);
        } else {
          projectMap(data, keys: [
            'consent',
            'review',
            'withdrawal',
            'signing_method',
            'identity_verification'
          ]);
          projectRequire(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN']
                  .contains(r['current_status']) &&
              data['signing_method'] == 'IN_APP_DECLARATION' &&
              data['identity_verification'] == 'NOT_VERIFIED');
          final c = projectMap(data['consent'], keys: [
            'avatar_id',
            'subject_party_id',
            'features',
            'purposes',
            'territories',
            'valid_from',
            'valid_until',
            'terms',
            'evidence_asset_ids'
          ]);
          projectRequire(projectIsId(c['avatar_id']) &&
              projectIsId(c['subject_party_id']) &&
              projectInstant(c['valid_from']) &&
              projectInstant(c['valid_until']) &&
              c['valid_from'].compareTo(c['valid_until']) < 0 &&
              projectText(c['terms']));
          for (final key in ['features', 'purposes', 'territories']) {
            final a = projectList(c[key], min: 1);
            projectRequire(a.every((v) => projectText(v, 100)) &&
                a.toSet().length == a.length);
          }
          projectRequire(projectList(c['features'], min: 1, max: 2)
              .every((v) => ['FACE', 'VOICE'].contains(v)));
          projectIds(c['evidence_asset_ids'], min: 1, max: 100);
        }
        rows.add(r);
      }
      cursor = d['next_cursor'];
      if (cursor != null) {
        projectRequire(projectIsId(cursor) && seen.add(cursor));
      }
    } while (cursor != null);
    return rows;
  }
}

bool projectConsentEligible(
    Map<String, dynamic> record, String avatar, Map<String, dynamic> scope,
    {DateTime? now}) {
  final d = record['data']?['consent'];
  if (d is! Map || record['current_status'] != 'APPROVED') return false;
  final time = (now ?? DateTime.now()).toUtc();
  final start = DateTime.tryParse('${d['valid_from']}'),
      end = DateTime.tryParse('${d['valid_until']}'),
      requiredEnd = DateTime.tryParse('${scope['valid_until']}');
  return d['avatar_id'] == avatar &&
      projectIsId(d['subject_party_id']) &&
      (d['features'] as List? ?? []).isNotEmpty &&
      (d['purposes'] as List? ?? []).contains(scope['purpose']) &&
      ((d['territories'] as List? ?? []).contains('WORLD') ||
          (d['territories'] as List? ?? []).contains(scope['territory'])) &&
      start != null &&
      end != null &&
      requiredEnd != null &&
      !start.isAfter(time) &&
      end.isAfter(time) &&
      !end.isBefore(requiredEnd);
}
