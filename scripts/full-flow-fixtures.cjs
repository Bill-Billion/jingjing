'use strict';
// Invoked only by the explicitly isolated fixture, never by the application.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
async function seed({call, request, records, people, assets, media, ruleId, grant, pay, checks, scenarios}) {
  const {payer: buyer, recipient: seller, independentReviewer: reviewer, outsider} = people;
  const buyerCtx = {person: buyer, party: buyer.actingPartyId};
  const sellerCtx = {person: seller, party: seller.actingPartyId};
  const now = Date.now(), until = days => new Date(now + days * 86400000).toISOString();
  const review = (domain, row, extra = {}) => call('POST', `/${domain}/records/${row.id}/reviews`, {
    person: reviewer, version: row.object_version,
    body: {decision: 'APPROVED', reason: '仅隔离模拟资料核验，不代表真实权利或资金', ...extra},
  });
  await grant('independentReviewer', 'LICENSE_REVIEW', true);
  let buyerProfile = await call('POST', '/supply/profiles', {...buyerCtx, body: {
    display_name: '模拟客户兼项目改稿方', description: '仅隔离测试；客户提交项目改稿需先完成资料审核',
    evidence_asset_ids: [assets.sponsorProof.id], previous_profile_id: null,
  }});
  records.walkBuyerProfile = await call('POST', `/supply/profiles/${buyerProfile.id}/reviews`, {
    person: reviewer, version: buyerProfile.object_version, body: {decision: 'APPROVED', reason: '仅模拟项目改稿方资料核验'},
  });
  records.walkLicenseSpec = await review('trade', await call('POST', '/trade/specifications', {...sellerCtx, body: {
    previous_spec_id: null, title: '模拟剧本许可费（非正式售价）', provider_party_id: seller.actingPartyId,
    line_kind: 'LICENSE', unit_minor: 1500, currency: 'CNY', specification: {version: 'isolated.v1', service_tier: '仅模拟许可',
      sample_seconds: 20, final_seconds: 90, revision_limit: 2, deliverables: ['仅模拟私人改编与制作许可'], terms: '仅模拟私人改编与制作'},
  }}));
  records.walkProduct = await review('licensing', await call('POST', '/licensing/products', {...sellerCtx, body: {
    work_version_id: records.originalWork.id, previous_product_id: null, title: '模拟剧本：窗前短笺',
    preview_text: '仅供测试：主人公整理旧物，发现一封未寄出的信。不是正式商品。',
    terms: {exclusive: false, rights: ['ADAPT','PRODUCE'], purposes: ['PRIVATE'], territories: ['CN'], languages: ['zh'],
      valid_from: until(-1), development_until: until(30), valid_until: until(90), project_limit: 2, episode_limit: 2,
      terms_text: '模拟私人改编与制作许可，不包含发行；数字仅用于测试。'},
    price: {currency: 'CNY', amount_minor: 1500}, payment_due_minor: 1500, reservation_minutes: 10080, rule_id: ruleId,
  }}));
  const checklist = stage => stage === 'SCRIPT' ? {script_reviewed: true} :
    {script_reviewed: true, specification_reviewed: true, audio_reviewed: true, branding_reviewed: true};
  const stages = [
    ['待确认报价','quote'], ['待付首款','unpaid'], ['待客户审样片','sample'],
    ['客户要求修改','revision'], ['待付尾款','final-payment'], ['已交付并确认结算','complete'],
  ];
  const journeys = [];
  for (const [label, stop] of stages) {
    const prefix = 'walk' + stop, put = (key, row) => (records[prefix + key] = row);
    const journey = {name: label, syntheticOnly: true, buyer: 'payer', seller: 'recipient', reviewer: 'independentReviewer',
      buyerPartyId: buyer.actingPartyId, sellerPartyId: seller.actingPartyId, stop, steps: []};
    journeys.push(journey);
    const reservation = put('Reservation', await call('POST', '/licensing/reservations', {...buyerCtx, body: {product_id: records.walkProduct.id}}));
    const quote = put('Quote', await review('trade', await call('POST', '/trade/quotes', {...sellerCtx, body: {
      buyer_party_id: buyer.actingPartyId, lines: [{line_id: 'film', spec_id: records.productionSpec.id, quantity: 1},
        {line_id: 'license', spec_id: records.walkLicenseSpec.id, quantity: 1}],
      installments: [{key: 'first', trigger: 'ORDER_ACCEPTED', allocations: [{line_id: 'film', amount_minor: 4000},
        {line_id: 'license', amount_minor: 1500}], apple_product_id: null},
        {key: 'last', trigger: 'FINAL_ACCEPTED', allocations: [{line_id: 'film', amount_minor: 6000}], apple_product_id: null}],
      channel: 'ALIPAY', transaction_model: 'DIRECT_SUPPLIER', rule_id: ruleId, expires_at: until(7),
      payment_window_minutes: 10080, license_reservation_id: reservation.id,
    }})));
    Object.assign(journey, {productId: records.walkProduct.id, reservationId: reservation.id, quoteId: quote.id});
    journey.steps.push('选本、许可预留、独立核对报价');
    if (stop === 'quote') continue;
    const order = put('Order', await call('POST', `/trade/quotes/${quote.id}/acceptance`, {...buyerCtx,
      version: quote.object_version, body: {quote_sha256: quote.content_sha256}}));
    journey.orderId = order.id; journey.steps.push('客户按准确报价确认订单和历史承诺');
    if (stop === 'unpaid') continue;
    await pay(order, 'first', prefix + 'FirstPayment'); journey.steps.push('模拟支付首款并通过原付款核对接口入账');
    let proof = await call('POST', '/licensing/evidence', {...buyerCtx, body: {
      reservation_id: reservation.id, contract_sha256: reservation.data.contract.content_sha256,
      seller_signature_asset_id: assets.producerProof.id, buyer_signature_asset_id: assets.sponsorProof.id,
      identity_asset_id: assets.sponsorProof.id, payment_asset_id: assets.sponsorProof.id,
      external_reference: 'isolated.walk.' + reservation.id,
    }});
    proof = put('Evidence', await review('licensing', proof, {verification: {
      signed_contract_sha256: reservation.data.contract.content_sha256, identity_verified: true,
      seller_signature_verified: true, buyer_signature_verified: true, currency: 'CNY', received_minor: 1500,
      payee_party_id: seller.actingPartyId, receipt_ref: 'isolated.walk.receipt.' + reservation.id,
    }}));
    const license = put('Grant', await call('POST', `/licensing/reservations/${reservation.id}/activation`, {
      person: reviewer, version: reservation.object_version, body: {evidence_id: proof.id, reason: '仅模拟许可独立核验'},
    }));
    const project = put('LicenseProject', await call('POST', '/licensing/projects', {...buyerCtx,
      body: {project: {title: '模拟完整流程 · ' + label, purpose: 'PRIVATE', territory: 'CN', language: 'zh', episodes: 1}}}));
    put('Binding', await call('POST', `/licensing/grants/${license.id}/bindings`, {...buyerCtx, version: license.object_version, body: {project_id: project.id}}));
    const content = put('AdaptationFile', await call('POST', '/supply/assets?purpose=WORK_CONTENT&media_type=text%2Fplain',
      {...buyerCtx, body: Buffer.from('仅模拟项目改稿：' + label + '，把未寄出的信改成主角写给未来的自己。')}));
    let work = await call('POST', '/supply/work-versions', {...buyerCtx, body: {work_id: null, previous_version_id: null,
      title: '模拟项目改稿 · ' + label, kind: 'PROJECT_ADAPTATION', source_version_id: records.originalWork.id,
      project_id: project.id, content_asset_id: content.id, evidence_ids: [assets.sponsorProof.id],
      credits: [{party_id: buyer.actingPartyId, role: 'RIGHTS_HOLDER', evidence_asset_ids: [assets.sponsorProof.id]}]}});
    work = await call('POST', `/supply/work-versions/${work.id}/actions`, {...buyerCtx, version: work.object_version, body: {action: 'SUBMIT', reason: null}});
    for (const channel of ['RIGHTS','CONTENT']) work = await call('POST', `/supply/work-versions/${work.id}/reviews`, {
      person: reviewer, version: work.object_version, body: {decision: 'APPROVED', channel, reason: '仅模拟改稿核对'},
    });
    put('Adaptation', work); journey.steps.push('分别核对模拟签署、付款与许可，绑定项目并审核改稿');
    let production = await call('POST', '/production/projects', {...sellerCtx, body: {order_id: order.id, line_id: 'film',
      script_version_id: work.id, license_project_id: project.id, assignee_account_id: seller.accountId,
      purpose: 'PRIVATE', territory: 'CN', consent_ids: [records.webPrivateConsent.id], evidence_asset_id: assets.producerProof.id}});
    production = await review('production', production, {verification: {contract_sha256: production.data.contract_sha256,
      identity_verified: true, signatures_verified: true, rights_verified: true}});
    put('Production', production); journey.productionId = production.id;
    await request('GET', `/production/records/${production.id}`, {person: outsider, party: outsider.personalPartyId, status: 404});
    for (const stage of ['SCRIPT','SAMPLE','ROUGH_CUT','FINAL']) {
      const upload = bytes => call('POST', `/production/projects/${production.id}/files?media_type=${stage === 'SCRIPT' ? 'text%2Fplain' : 'video%2Fmp4'}`, {...sellerCtx, body: bytes});
      const file = await upload(stage === 'SCRIPT' ? Buffer.concat([media.script.bytes, Buffer.from(crypto.randomUUID())]) : media[stage === 'FINAL' ? 'final' : 'preview'].bytes);
      const preview = stage === 'FINAL' ? await upload(media.preview.bytes) : file;
      production = await call('GET', `/production/records/${production.id}`, buyerCtx);
      let version = await call('POST', `/production/projects/${production.id}/versions`, {...sellerCtx, version: production.object_version,
        body: {stage, file_id: file.id, preview_file_id: preview.id, note: '模拟版本 · ' + label}});
      version = put(stage, await review('production', version, {verification: checklist(stage)}));
      journey.versionId = version.id; journey.steps.push(stage + '版本上传、独立审核');
      if (stage === 'SAMPLE' && stop === 'sample') break;
      const decision = stage === 'SAMPLE' && stop === 'revision' ? 'REQUEST_CHANGES' : 'ACCEPT';
      await call('POST', `/production/versions/${version.id}/feedback`, {...buyerCtx, version: version.object_version,
        body: {decision, note: decision === 'ACCEPT' ? '模拟客户确认当前版本' : '模拟修改意见：放慢片头节奏', checklist: decision === 'ACCEPT' ? checklist(stage) : null}});
      journey.steps.push(stage + '客户' + (decision === 'ACCEPT' ? '验收' : '要求修改'));
      if (decision === 'REQUEST_CHANGES') break;
    }
    if (stop !== 'complete') continue;
    await pay(order, 'last', prefix + 'LastPayment');
    const final = await request('GET', `/production/versions/${journey.versionId}/content?variant=final`, buyerCtx);
    assert(final.body.equals(media.final.bytes));
    journey.steps.push('模拟尾款核对后，客户取得正确私有最终文件');
    let agreement = await call('POST', '/finance/agreements', {...sellerCtx, body: {source_type: 'ORDER', source_id: order.id,
      previous_agreement_id: null, environment: 'SANDBOX', rule_id: ruleId, evidence_asset_id: assets.producerProof.id,
      rules: {version: 'isolated.walk.v1', settlement_at: until(-1), release_condition: 'RECEIVED', terms: '仅模拟100%归供应方，不是正式分成',
        lines: ['film','license'].map(line_id => ({line_id, shares: [{party_id: seller.actingPartyId, bps: 10000, role: 'SUPPLIER'}], deductions: []}))}}});
    const verification = {parties_verified: true, contract_verified: true, amount_verified: true, evidence_verified: true};
    agreement = put('Agreement', await review('finance', agreement, {verification}));
    const confirm = async row => { for (const ctx of [buyerCtx, sellerCtx]) await call('POST', `/finance/records/${row.id}/confirmations`,
      {...ctx, version: row.object_version, body: {content_sha256: row.content_sha256, decision: 'APPROVED', reason: '模拟双方确认原始内容'}}); };
    await confirm(agreement);
    let settlement = await call('POST', `/finance/agreements/${agreement.id}/settlements`, {...sellerCtx, version: agreement.object_version,
      body: {period_reference: 'isolated.walk.complete', note: '仅依据模拟实收计算，不冒充真实转账'}});
    settlement = put('Settlement', await review('finance', settlement, {verification})); await confirm(settlement);
    journey.agreementId = agreement.id; journey.settlementId = settlement.id;
    journey.steps.push('按该笔SANDBOX实收生成结算，独立审核与双方确认');
  }
  scenarios.fullFlow = {syntheticOnly: true, journeys, productId: records.walkProduct.id,
    limitations: ['仅本地虚构资料，外部短信、文件存储和支付均为模拟传输', '模拟签署、实名和权利证据不构成真实审核', '状态断点供继续操作，重新启动创建新库，不覆盖旧实例']};
  checks.push('Full-flow: six independent live API journeys from licensed script to unpaid/review/revision/final-payment/settlement checkpoints; complete journey verifies private delivered bytes and outsider denial');
}
module.exports = {seed};
