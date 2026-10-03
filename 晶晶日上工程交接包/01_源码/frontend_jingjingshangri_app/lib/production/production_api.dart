import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../account/account_session.dart';
import '../contracts/contract_api.dart';
import 'production_models.dart';

class ProductionPage {
  const ProductionPage(this.items, this.nextCursor);
  final List<ProductionRecord> items;
  final String? nextCursor;
}

class ProductionContent {
  const ProductionContent(this.bytes, this.mediaType);
  final Uint8List bytes;
  final String mediaType;
}

class ProductionApi {
  ProductionApi(this.session);
  final AccountSession session;
  String participant() {
    if (!session.isLoggedIn) {
      throw const AccountError(401, 'AUTHENTICATION_REQUIRED');
    }
    if (session.partyId == null ||
        session.productionAccessDenied ||
        session.selected?['membership']?['current_status'] != 'ACTIVE' ||
        ['SUSPENDED', 'CLOSED'].contains(session.party?['current_status'])) {
      throw const AccountError(403, 'PRODUCTION_PARTY_FORBIDDEN');
    }
    return session.partyId!;
  }

  void check(int epoch, String party) {
    if (epoch != session.epoch || party != participant()) {
      throw const AccountError(0, 'CONTEXT_CHANGED');
    }
  }

  void projectScope(ProductionRecord record, String party) {
    if (record.kind != 'PROJECT') return;
    productionRequire([
          record.data['buyer_party_id'],
          record.data['merchant_party_id'],
          record.data['producer_party_id']
        ].contains(party) &&
        (session.isOwner ||
            record.data['assignee_account_id'] == session.account?['id']));
  }

  Future<ProductionRecord> record(String id, {String? kind}) async {
    if (!isContractId(id)) throw const AccountError(400, 'INVALID_ID');
    final p = participant(), epoch = session.epoch;
    final raw =
        await session.read('/api/v1/production/records/$id', actingParty: p);
    check(epoch, p);
    final record = ProductionRecord.parse(raw, id: id, kind: kind);
    projectScope(record, p);
    return record;
  }

  Future<ProductionPage> page(
      {String? projectId, String? kind, String? cursor}) async {
    if (projectId != null && !isContractId(projectId)) {
      throw const AccountError(400, 'INVALID_ID');
    }
    final p = participant(), epoch = session.epoch;
    final raw = await session.read(
        projectId == null
            ? '/api/v1/production/projects'
            : '/api/v1/production/projects/$projectId/records',
        actingParty: p,
        query: {
          'limit': 20,
          if (kind != null) 'kind': kind,
          if (cursor != null) 'cursor': cursor
        });
    check(epoch, p);
    productionRequire(raw.length == 2 &&
        raw['items'] is List &&
        raw['items'].length <= 100 &&
        (raw['next_cursor'] == null || isContractId('${raw['next_cursor']}')) &&
        (raw['next_cursor'] == null || raw['next_cursor'] != cursor));
    final rows = (raw['items'] as List)
        .map((r) => ProductionRecord.parse(r,
            kind: projectId == null ? 'PROJECT' : kind, projectId: projectId))
        .toList();
    productionRequire(rows.map((r) => r.id).toSet().length == rows.length);
    for (final record in rows) {
      projectScope(record, p);
    }
    return ProductionPage(rows, raw['next_cursor']);
  }

  Future<List<ProductionRecord>> all({String? projectId, String? kind}) async {
    final rows = <ProductionRecord>[], seen = <String>{};
    String? cursor;
    do {
      final result =
          await page(projectId: projectId, kind: kind, cursor: cursor);
      rows.addAll(result.items);
      cursor = result.nextCursor;
      if (cursor != null) productionRequire(seen.add(cursor));
    } while (cursor != null);
    return {for (final r in rows) r.id: r}.values.toList();
  }

  Map<String, dynamic>? pending(String path) =>
      session.pending('POST', path, actingParty: participant());
  Future<ProductionRecord> _feedback(
      String path, Map<String, dynamic> body, int version) async {
    final p = participant(), epoch = session.epoch;
    final raw = await session.write('POST', path,
        actingParty: p,
        body: body,
        version: version,
        validate: (r) => ProductionRecord.parse(r, kind: 'FEEDBACK'));
    check(epoch, p);
    return ProductionRecord.parse(raw, kind: 'FEEDBACK');
  }

  Future<ProductionRecord> feedback(
      ProductionRecord version,
      ProductionRecord project,
      String decision,
      String note,
      Map<String, bool>? checklist) {
    if (!session.isOwner || !project.buyer(participant())) {
      throw const AccountError(403, 'PRODUCTION_BUYER_REQUIRED');
    }
    if (version.kind != 'VERSION' ||
        version.projectId != project.id ||
        version.status != 'APPROVED' ||
        !version.current(project) ||
        version.accepted(project)) {
      throw const AccountError(409, 'CURRENT_APPROVED_VERSION_REQUIRED');
    }
    if (!['ACCEPT', 'REQUEST_CHANGES'].contains(decision) ||
        note.trim().isEmpty ||
        note.length > 4000) {
      throw const AccountError(400, 'INVALID_FEEDBACK');
    }
    if (decision == 'ACCEPT' &&
        (checklist == null ||
            checklist.length != productionCheckNames(version.stage).length ||
            productionCheckNames(version.stage)
                .any((k) => checklist[k] != true))) {
      throw const AccountError(400, 'ACCEPTANCE_CHECKS_INCOMPLETE');
    }
    if (decision == 'REQUEST_CHANGES' &&
        (checklist != null ||
            project.data['change_requests'] >=
                project.data['specification']['revision_limit'])) {
      throw const AccountError(409, 'REVISION_LIMIT_REACHED');
    }
    return _feedback(
        '/api/v1/production/versions/${version.id}/feedback',
        {'decision': decision, 'note': note.trim(), 'checklist': checklist},
        version.version);
  }

  Future<ProductionRecord> retry(String path) async {
    final op = pending(path);
    if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
    final target = await record(path.split('/')[5], kind: 'VERSION');
    if (op['resultId'] != null) await record(op['resultId'], kind: 'FEEDBACK');
    if (target.projectId != null) {
      await all(projectId: target.projectId, kind: 'FEEDBACK');
    }
    // Replaying the same key is required even when GET finds a recorded result.
    return _feedback(path, productionMap(op['body']), op['version'] as int);
  }

  Future<ProductionContent> content(ProductionRecord version,
      {String variant = 'preview'}) async {
    if (version.kind != 'VERSION' || !['preview', 'final'].contains(variant)) {
      throw const AccountError(400, 'INVALID_VARIANT');
    }
    final p = participant(), epoch = session.epoch;
    final fresh = await record(version.id, kind: 'VERSION');
    final file = await record(
        fresh.data[variant == 'preview' ? 'preview_file_id' : 'file_id'],
        kind: 'FILE');
    productionRequire(file.projectId == fresh.projectId &&
        file.orderId == fresh.orderId &&
        file.status == 'READY' &&
        file.data['media_type'] ==
            (fresh.stage == 'SCRIPT' ? 'text/plain' : 'video/mp4'));
    final bytes = await session.readBytes(
        '/api/v1/production/versions/${fresh.id}/content',
        actingParty: p,
        query: {'variant': variant});
    check(epoch, p);
    if (bytes.length != file.data['byte_size'] ||
        sha256.convert(bytes).toString() != file.data['content_sha256']) {
      throw const AccountError(503, 'PRIVATE_CONTENT_MISMATCH');
    }
    return ProductionContent(bytes, file.data['media_type']);
  }

  Future<Map<String, dynamic>> readiness(String projectId) async {
    final p = participant(), epoch = session.epoch;
    final raw = await session.read(
        '/api/v1/production/projects/$projectId/generation-readiness',
        actingParty: p);
    check(epoch, p);
    productionRequire(
        ['NOT_ENABLED', 'SERVICE_READY'].contains(raw['current_status']) &&
            raw['provider_code'] is String &&
            raw['config_revision'] is String &&
            ['SANDBOX', 'PRODUCTION'].contains(raw['environment']));
    return raw;
  }
}
