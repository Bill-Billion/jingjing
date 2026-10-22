import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import '../account/account_api.dart';
import '../operations/operation_api.dart';
import '../supply/supply_api.dart';
import 'production_api.dart';
import 'production_models.dart';
import 'fulfillment_models.dart';

extension ProductionFulfillmentApi on ProductionApi {
  String fulfillmentPath(String projectId, String action) =>
      '/api/v1/production/projects/$projectId/$action';
  Future<ProductionFulfillment> fulfillment(ProductionRecord project) async {
    final p = participant(), epoch = session.epoch;
    projectScope(project, p);
    productionRequire(project.kind == 'PROJECT');
    final raw = await session.read(fulfillmentPath(project.id, 'fulfillment'),
        actingParty: p);
    check(epoch, p);
    return ProductionFulfillment(raw, project);
  }

  Future<ProductionStory> story(
      ProductionRecord project, ProductionFulfillment flow) async {
    final p = participant(), epoch = session.epoch;
    projectScope(project, p);
    productionRequire(
        flow.projectId == project.id && flow.orderId == project.orderId);
    final raw = await session.read(fulfillmentPath(project.id, 'story'),
        actingParty: p);
    check(epoch, p);
    return ProductionStory(raw, flow);
  }

  Future<ProductionFulfillment> changeFulfillment(ProductionRecord project,
      ProductionFulfillment flow, String action, Map<String, dynamic> body,
      {int? originalVersion}) async {
    final p = participant(), epoch = session.epoch;
    projectScope(project, p);
    productionRequire(
        flow.projectId == project.id && flow.orderId == project.orderId);
    if (!['cases', 'delivery-receipt', 'refund-sync', 'start', 'reissue']
        .contains(action)) {
      throw const AccountError(400, 'INVALID_ACTION');
    }
    if (['cases', 'delivery-receipt'].contains(action) &&
        (!session.isOwner ||
            (action == 'delivery-receipt'
                ? !project.buyer(p)
                : ![
                    project.data['buyer_party_id'],
                    project.data['merchant_party_id']
                  ].contains(p)))) {
      throw const AccountError(403, 'PRODUCTION_BUYER_REQUIRED');
    }
    if (['start', 'reissue'].contains(action) &&
        project.data['assignee_account_id'] != session.account?['id']) {
      throw const AccountError(403, 'PRODUCTION_PRODUCER_REQUIRED');
    }
    final raw = await session.write('POST', fulfillmentPath(project.id, action),
        actingParty: p,
        body: body,
        version: originalVersion ?? flow.version, validate: (r) {
      ProductionFulfillment(r, project);
    });
    check(epoch, p);
    return ProductionFulfillment(raw, project);
  }

  Future<ProductionFulfillment> retryFulfillment(
      ProductionRecord project, String path) async {
    final op = pending(path);
    if (op == null) throw const AccountError(409, 'NO_PENDING_OPERATION');
    final action = path.split('/').last;
    productionRequire(path == fulfillmentPath(project.id, action));
    final current = await fulfillment(project);
    // Reconcile current context without replacing the original body/version/key.
    return changeFulfillment(
        project, current, action, productionMap(op['body']),
        originalVersion: op['version']);
  }

  Future<ProductionFulfillment> receiveDeliveryNotice(ProductionRecord project,
      ProductionFulfillment flow, ProductionRecord version,
      {required bool contentOpened}) async {
    final p = participant(), epoch = session.epoch, r = flow.receipt;
    if (!contentOpened ||
        r == null ||
        r['version_id'] != version.id ||
        r['view_observed_at'] == null ||
        r['buyer_account_id'] != session.account?['id'] ||
        !session.isOwner ||
        !project.buyer(p)) {
      throw const AccountError(409, 'CUSTOMIZATION_PREVIEW_NOT_VIEWED');
    }
    final notices = OperationApi(session),
        n = await notices.notice(r['notification_event_id']);
    check(epoch, p);
    productionRequire(n != null &&
        n.domain == 'PRODUCTION' &&
        n.recordId == version.id &&
        n.code == 'CUSTOMIZATION_FORMAL_DELIVERY');
    await notices.markRead(n!.id);
    check(epoch, p);
    return fulfillment(project);
  }

  Future<Uint8List> caseEvidence(
      ProductionRecord project, FulfillmentCase issue, String assetId) async {
    final p = participant(), epoch = session.epoch;
    projectScope(project, p);
    if (issue.data['opened_by_party_id'] != p ||
        !issue.data['evidence_asset_ids'].contains(assetId)) {
      throw const AccountError(404, 'EVIDENCE_NOT_READY');
    }
    final asset = await SupplyApi(session).asset(assetId);
    productionRequire(
        ['REVIEW_EVIDENCE', 'RIGHTS_EVIDENCE'].contains(asset['purpose']));
    final bytes = await session.readBytes(
        fulfillmentPath(project.id, 'cases/${issue.id}/evidence/$assetId'),
        actingParty: p);
    check(epoch, p);
    productionRequire(bytes.length == asset['byte_size'] &&
        sha256.convert(bytes).toString() == asset['content_sha256']);
    return bytes;
  }
}
