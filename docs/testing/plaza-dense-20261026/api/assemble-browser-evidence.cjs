'use strict';
// Collects observed passing cases. Original run failures remain in browser-runs;
// the one reviewed revoked capture is explicitly separate from automated PASS.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const out = path.join(root, 'output/playwright/plaza-dense-20261026');
const sha = b => createHash('sha256').update(b).digest('hex');
async function main() {
  const files = ['browser-results-interrupted.json', 'browser-results-form-input.json', 'browser-results-completion.json', 'browser-results-writes2.json'];
  if (process.env.PLAZA_FINAL_COPY_RUN) {
    assert(/^[a-z0-9-]+$/.test(process.env.PLAZA_FINAL_COPY_RUN));
    files.push('browser-results-' + process.env.PLAZA_FINAL_COPY_RUN + '.json');
  }
  const rechecks = (process.env.PLAZA_UI_RECHECK_RUNS || process.env.PLAZA_UI_RECHECK_RUN || '').split(',').filter(Boolean);
  for (const tag of rechecks) { assert(/^[a-z0-9-]+$/.test(tag)); files.push('browser-results-' + tag + '.json'); }
  const runs = [], byCase = new Map();
  const destination = path.join(__dirname, 'browser-evidence'), archive = path.join(__dirname, 'browser-runs');
  // Preserve earlier copied captures: visual reports link to both before and
  // after images. New runs use distinct suffixes and must not erase them.
  assert.equal(path.dirname(destination), __dirname);
  await fs.mkdir(destination, { recursive: true }); await fs.mkdir(archive, { recursive: true });
  const supportingVisualCaptures = [];
  for (const file of files) {
    const bytes = await fs.readFile(path.join(out, file)), data = JSON.parse(bytes);
    assert.equal(data.mocked_success_responses, 0);
    const isUiRecheck = rechecks.some(tag => file === 'browser-results-' + tag + '.json');
    if (!isUiRecheck) { assert.equal(data.errors.length, 0); assert.equal(data.blocked_requests.length, 0); }
    await fs.writeFile(path.join(archive, file), bytes);
    runs.push({ file: 'browser-runs/' + file, sha256: sha(bytes), original_status: data.status, build: data.build,
      actual_requests_in_whole_run: data.actual_request_count, synthetic_writes_in_whole_run: data.synthetic_write_count });
    if (isUiRecheck) {
      const passed = new Set(data.results.filter(r => r.result === 'PASS_PENDING_VISUAL_REVIEW').map(r => r.case));
      for (const shot of data.screenshots.filter(s => passed.has(s.case))) {
        const image = await fs.readFile(path.join(out, shot.file)); assert.equal(sha(image), shot.sha256);
        await fs.writeFile(path.join(destination, shot.file), image);
        await fs.copyFile(path.join(out, shot.file.replace('.png', '.aria.txt')), path.join(destination, shot.file.replace('.png', '.aria.txt')));
        supportingVisualCaptures.push({ file: 'browser-evidence/' + shot.file, source_run: 'browser-runs/' + file, bundle_sha256: data.build.sha256 });
      }
    }
    for (const result of data.results.filter(r => isUiRecheck || r.result === 'PASS_PENDING_VISUAL_REVIEW')) byCase.set(result.case, { result, data, file });
  }
  const revoked = JSON.parse(await fs.readFile(path.join(__dirname, 'artist-revocation-verification.json')));
  assert.equal(revoked.status, 'PASS_REVIEWED_CAPTURE_AND_FRESH_HTTP');
  const raw = JSON.parse(await fs.readFile(path.join(out, 'browser-results-writes2.json')));
  byCase.set(revoked.case, {
    result: { case: revoked.case, width: 390, result: revoked.status, checks: revoked.checks,
      method: revoked.method, original_automation_result: 'FAIL', selector_correction: revoked.reason },
    data: raw, file: 'browser-results-writes2.json'
  });
  assert([27, 33, 36].includes(byCase.size));
  const results = [], screenshots = [], requests = [], writes = [], controlled = [], controlledHttp = [];
  for (const [name, item] of byCase) {
    const trialVerified = item.result.checks.some(c => c.canonical_route === '/auditions/catalog' && c.city === '郑州' && c.confirmed_public_offer_id);
    const pendingTrial = name.startsWith('artist-detail-') && !trialVerified;
    results.push({ ...item.result, source_run: 'browser-runs/' + item.file, bundle_sha256: item.data.build.sha256,
      ...(pendingTrial ? { result: 'DEFECT_FOUND_RETEST_PENDING', original_automation_result: item.result.result,
        defect: 'Visual review found the public audition action lands on 页面不存在. The old script only clicked the action and lacked destination/HTTP/city assertions.',
        required_retest: 'Canonical /auditions/catalog, actual city 郑州, real catalogue HTTP 200, known offer rendered, no missing/generic failure page.' } : {}) });
    requests.push(...item.data.requests.filter(r => r.case === name));
    writes.push(...item.data.writes.filter(r => r.case === name));
    controlled.push(...(item.data.controlled_transport_faults || []).filter(r => r.case === name));
    controlledHttp.push(...(item.data.controlled_http_responses || []).filter(r => r.case === name));
    const shots = item.data.screenshots.filter(s => s.case === name);
    if (name === revoked.case) shots.push({ case: name, phase: 'revoked-state-reviewed', file: revoked.screenshot,
      route: '/artists/catalog (public detail pushed from catalogue)', viewport: { width: 390, height: 844 },
      sha256: revoked.screenshot_sha256, status: revoked.status, note: revoked.reason });
    for (const shot of shots) {
      const bytes = await fs.readFile(path.join(out, shot.file));
      assert.equal(sha(bytes), shot.sha256, 'Unmodified screenshot: ' + shot.file);
      await fs.writeFile(path.join(destination, shot.file), bytes);
      const aria = shot.file.replace('.png', '.aria.txt');
      await fs.copyFile(path.join(out, aria), path.join(destination, aria));
      screenshots.push({ ...shot, source_run: 'browser-runs/' + item.file, bundle_sha256: item.data.build.sha256,
        file: 'browser-evidence/' + shot.file, aria: 'browser-evidence/' + aria });
    }
  }
  requests.push(...revoked.current_requests.map(r => ({ ...r, case: revoked.case })));
  assert.equal(writes.length, 5);
  assert(writes.every(w => w.status === 200));
  assert.equal(controlled.length, 3);
  // Close the visual status only after the reviewers have recorded their
  // actual image inspection. Every selected PNG must occur in one report or
  // have identical bytes to a PNG explicitly listed there.
  const visualReviews = [];
  if (process.env.PLAZA_VISUAL_REVIEW_CONFIRMED === '1') {
    for (const name of ['VISUAL_HOME.md', 'VISUAL_SUBPAGES.md']) {
      const reportPath = path.join(root, 'docs/reviews/plaza-dense-20261026', name);
      const bytes = await fs.readFile(reportPath);
      visualReviews.push({ file: path.relative(__dirname, reportPath), sha256: sha(bytes), text: bytes.toString('utf8') });
    }
    const reviewedImages = [];
    for (const file of (await fs.readdir(destination)).filter(f => f.endsWith('.png'))) {
      const reports = visualReviews.filter(r => r.text.includes(file));
      if (reports.length) reviewedImages.push({ file, sha256: sha(await fs.readFile(path.join(destination, file))), reports: reports.map(r => r.file) });
    }
    for (const capture of screenshots) {
      const file = path.basename(capture.file);
      const direct = visualReviews.filter(r => r.text.includes(file));
      const identical = reviewedImages.find(r => r.sha256 === capture.sha256);
      assert(direct.length || identical, 'No recorded visual review for selected capture: ' + file);
      capture.visual_review = { status: 'REVIEWED', reports: direct.length ? direct.map(r => r.file) : identical.reports,
        ...(direct.length ? {} : { identical_reviewed_capture: 'browser-evidence/' + identical.file }) };
      capture.capture_status_at_run = capture.status;
      capture.status = 'CAPTURED_AND_VISUAL_REVIEWED';
    }
    for (const entry of results.filter(r => r.result.startsWith('PASS'))) {
      if (entry.result === 'PASS_PENDING_VISUAL_REVIEW') {
        entry.automation_result = entry.result;
        entry.result = 'PASS_FUNCTIONAL_AND_VISUAL_REVIEWED';
      }
      entry.visual_review = { status: 'PASS_WITH_RECORDED_LIMITS', reports: [...new Set(screenshots.filter(c => c.case === entry.case).flatMap(c => c.visual_review.reports))] };
    }
  }
  const pendingCases = results.filter(r => !r.result.startsWith('PASS'));
  const acceptedNames = new Set(results.filter(r => r.result.startsWith('PASS')).map(r => r.case));
  const cleanupBytes = await fs.readFile(path.join(__dirname, 'joint-cleanup.json')).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  const cleanup = cleanupBytes && JSON.parse(cleanupBytes);
  if (cleanup) assert(cleanup.status === 'STOPPED' && cleanup.database_removed && cleanup.credentials_removed && cleanup.web_server_stopped && cleanup.shared_mysql_preserved);
  const result = { status: pendingCases.length ? 'DEFECT_FOUND_RETEST_PENDING' : visualReviews.length ? 'FUNCTIONAL_AND_VISUAL_CHECKS_PASSED_WITH_RECORDED_LIMITS' : 'FUNCTIONAL_CHECKS_PASSED_VISUAL_COMPARISON_SEPARATE', checked_at: new Date().toISOString(),
    synthetic_only: true, checked_cases: results.length, accepted_cases: results.length - pendingCases.length,
    pending_defect_cases: pendingCases.map(r => r.case), automated_cases: results.filter(r => (r.automation_result || r.result) === 'PASS_PENDING_VISUAL_REVIEW').length, reviewed_capture_and_fresh_http_cases: 1,
    observed_case_http_count: requests.filter(r => r.method !== 'OPTIONS').length,
    accepted_case_http_count: requests.filter(r => r.method !== 'OPTIONS' && acceptedNames.has(r.case)).length,
    accepted_browser_http_count: requests.filter(r => r.method !== 'OPTIONS' && r.source === 'browser-real-http' && acceptedNames.has(r.case)).length,
    screenshots: screenshots.length, synthetic_writes: writes.length, controlled_transport_faults: controlled,
    controlled_http_responses: controlledHttp,
    final_catalogue_count: 7, source_runs: runs, results, captures: screenshots, requests, writes,
    supporting_visual_captures: supportingVisualCaptures,
    visual_review_reports: visualReviews.map(({ text, ...report }) => report),
    runtime_cleanup: cleanup ? { file: 'joint-cleanup.json', sha256: sha(cleanupBytes), status: cleanup.status } : null,
    provenance: [
      'All original JSON results are retained. Visual review invalidated the old artist-detail audition-navigation result; it stays pending until explicit destination/city/HTTP assertions pass.',
      'The interrupted run was stopped before writing to fix test-input timing; its browser-close failures are test interruption, not product failures.',
      'Subsequent scroll and alertdialog selector corrections affect test automation, not business source.',
      'One revoked-state waiter excluded the eyebrow from its exact accessible name. The captured unavailable UI plus 200/withdrawal/409 sequence was independently checked and fresh HTTP confirms the withdrawn state.',
      'Source commit fields in the initial run records identify the integration base; the exact compiled working-tree bundle is identified by SHA-256.',
      visualReviews.length ? 'Selected screenshots were compared by the recorded home/subpage reviewers. Each image is linked to a report by filename or identical SHA-256; original automation reports remain unchanged.' : 'Screenshots remain pending comparison with the design unless recorded separately by the parent review.'
    ],
    limits: ['No production or true providers; five writes concern this disposable synthetic database only.',
      'Media are synthetic pictogram PNG and color-bar MP4.',
      'Engagement, customization, production, supply upload and actual payment flows were not exercised by this joint fixture.',
      'No screenshot or HTTP test establishes browser/GPU memory zeroization.']
  };
  await fs.writeFile(path.join(__dirname, 'browser-acceptance.json'), JSON.stringify(result, null, 2) + '\n');
  const md = [
    '# 广场浏览器验收覆盖映射', '',
    pendingCases.length ? '已检查' + results.length + '组；目前有' + pendingCases.length + '组待复验，不能宣称全部通过。旧艺人详情的试镜跳转缺陷按三宽记录；其余原HTTP和状态证据保留。' : results.length + '组行为检查由下列原始运行构成；' + result.automated_cases + '组自动断言通过，1组撤权使用真实截图/原请求链复核并追加只读HTTP。' + (visualReviews.length ? '当前映射截图已逐图对照，已知差异与未覆盖范围保留在[主页审阅](../../../reviews/plaza-dense-20261026/VISUAL_HOME.md)和[子页审阅](../../../reviews/plaza-dense-20261026/VISUAL_SUBPAGES.md)。本表关闭视觉待审状态，原始自动运行JSON不改写。' : '截图的设计一致性由本轮视觉审阅另记。'), '',
    '视觉逐图发现旧 artist-detail 的“查看公开试镜方案”跳到未映射的 /auditions，三宽截图均显示“页面不存在”；旧脚本只点按钮，未核对目的路由。旧原始报告保留。' + (results.some(r => r.case.startsWith('artist-detail-') && !r.result.startsWith('PASS')) ? '当前必须按 canonical 路由、城市、实际目录响应与可见方案复验。' : '新三宽运行已按 canonical /auditions/catalog、城市郑州、真实目录200和实际方案可见复验，且验证返回原艺人详情。'), '',
    '版本按逐行哈希区分：早期文案版26d1d0e9…，受影响UI修正版b95b7ffe…，中性“入口”末版0f38bca1…。末版仅重跑三宽search-directory；其他行为和图片沿用其未受该标签改动影响的明确版本，不把历史图冒称末版重拍。', '',
    '| 用例 | 宽度 | 结果 | 原始运行 | 编译 bundle SHA-256 |',
    '| --- | ---: | --- | --- | --- |',
    ...results.map(r => '| ' + r.case + ' | ' + r.width + ' | ' + r.result + ' | [' + path.basename(r.source_run) + '](' + r.source_run + ') | ' + r.bundle_sha256 + ' |'),
    '', '本表原运行包含 ' + result.observed_case_http_count + ' 次实际 HTTP，当前通过用例对应' + result.accepted_case_http_count + '次；HTTP次数不代表失败导航通过。5 次写入均限隔离合成资料。3 次受控浏览器断网单列，未当作后端真实错误。', '',
    '写入为：一个未付原订单、PROFILE/ROLE/CREATE_DRAMA 各一份待独立审核投稿，以及第 8 位合成艺人的同意撤回。目录现在为 7 位，未重复撤回，也未伪造恢复原同意。', '',
    'S06报价变化为三宽各一次明确标注的浏览器受控412；拦截的checkout未到后端，不计入真实HTTP或实际写入。它只验证清除旧报价/许可勾选、禁用购买和真实GET重读后的重新确认。真实创建未付订单与后台烟测仍引用原独立证据。', '',
    'S05新版不可用布局另用三宽各一次受控GET409，先取得真实PNG再测试清图/空态；随后真实资产仍返回200，确认未再次撤权。此组证明新布局与UI恢复，原真实撤权请求链另列。', '',
    '最后一次自动等待超时原因：Flutter 的公开详情标题可访问名称包含“公开授权 / 当前核对结果”，原脚本只匹配标题本句。保留的截图已经显示资料不可用且预览/保存按钮消失；原链路为图片 200 → 本人撤回 200 → 图片 409 ARTIST_CONSENT_REQUIRED。之后 3 次只读请求再次确认 WITHDRAWN、目录 7 位且旧资产仍拒绝。详见 [撤权复核](artist-revocation-verification.json)。此项明确记为截图与真实 HTTP 复核，不冒称原自动化全绿。', '',
    '前期定位、滚轮、输入切焦点和 alertdialog 选择器已修正。中断原运行是为修正测试输入时序，在其写入前停止，后续浏览器关闭错误不是页面业务错误。正式来源表不依赖这些未通过的部分。', '',
    '目录合成头像、色条视频不代表真实作品质量；未测生产、短信、真实支付、附件上传或外部提供商。未开放的其他业务入口只保留导航，不推断后端完成。', '',
    ...(cleanup ? ['本轮联调服务、随机数据库与短期凭据已清理，共用MySQL及PR37独立体验环境保留；独立查询确认本轮库已不存在，5500/53781均停止监听。见[清理证据](joint-cleanup.json)。', ''] : []),
    '[截图索引](browser-evidence/index.html) · [完整验收数据](browser-acceptance.json)', ''
  ].join('\n');
  await fs.writeFile(path.join(__dirname, 'COVERAGE.md'), md);
  const html = '<!doctype html><meta charset="utf-8"><title>广场页面与真实接口验收</title><style>body{font:16px system-ui;background:#f3f0e6;color:#171613;margin:24px}article{display:inline-block;vertical-align:top;width:320px;margin:12px}img{width:100%;border:1px solid #bbb}p{font-size:12px;line-height:1.5}</style><h1>广场页面与真实接口验收</h1><p>' + result.status + ' · 已检查' + results.length + '组 · ' + result.accepted_cases + '组已采纳 · 待复验' + pendingCases.length + '组</p><p>合成资料 · ' + result.accepted_case_http_count + '次实际HTTP · 5次限定合成写入 · 撤权后7名公开艺人</p><p>旧试镜跳转的缺页问题已单列，不把HTTP成功等同目的页面可用。原运行状态及限制见 <a href="../browser-acceptance.json">验收记录</a>。' + (visualReviews.length ? '当前映射图片已逐图审阅，已知差异与未覆盖范围见对应视觉报告。' : '图片仍按设计逐页复核。') + '</p>' +
    screenshots.map(s => '<article><p>' + s.case + ' / ' + s.phase + ' / ' + s.viewport.width + '</p><a href="' + path.basename(s.file) + '"><img loading="lazy" src="' + path.basename(s.file) + '"></a></article>').join('');
  await fs.writeFile(path.join(destination, 'index.html'), html);
  console.log(JSON.stringify({ status: result.status, cases: result.accepted_cases, requests: result.accepted_case_http_count, screenshots: result.screenshots, writes: result.synthetic_writes, copied_to: path.relative(root, destination) }));
}
main().catch(e => { console.error(e.stack || e.message); process.exitCode = 1; });
