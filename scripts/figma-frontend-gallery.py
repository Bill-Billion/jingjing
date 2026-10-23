#!/usr/bin/env python3
"""Bind reviewed screenshots to the 103 Figma nodes. No browser or service calls."""
from pathlib import Path
import collections, hashlib, html, json, os, re

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/testing/evidence/figma-frontend-restore-20261023'
MAPPING = ROOT / 'docs/reviews/figma-frontend-restore-20261023/SCREEN_MAPPING.json'

def read(path):
    return json.loads(path.read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def relative(path):
    return str(path.relative_to(ROOT))

def href(path):
    return html.escape(os.path.relpath(path, BASE), quote=True)

# Every replacement is an entire case/width group, never its first viewport.
# No source PNG is copied or edited by this generator.
shots = []
source_reports = {}
def ids_for(*values):
    ids = []
    for value in values:
        if isinstance(value, dict):
            for key in ['figmaIds', 'figmaId']:
                if key in value:
                    ids += ids_for(value[key])
            for key in ['design_references', 'designReferences', 'references']:
                for ref in value.get(key, []):
                    ids += ids_for(ref.get('figma_id', ref.get('node_id')))
        elif isinstance(value, list):
            for item in value:
                ids += ids_for(item)
        elif isinstance(value, str) and re.fullmatch(r'[0-9]+:[0-9]+', value):
            ids.append(value)
    return list(dict.fromkeys(ids))

def record(file, case, width, ids, bundle, sha=None,
           kind='RELATED_VISUAL_REFERENCE', **extra):
    file = Path(file)
    file = file if file.is_absolute() else ROOT / file
    assert file.is_file(), file
    actual = digest(file)
    if sha:
        assert actual == sha, str(file) + ' changed after review'
    assert re.fullmatch(r'[a-f0-9]{64}', bundle or ''), (case, bundle)
    return dict(file=relative(file), case=case, width=width,
                figmaIds=ids_for(ids), sourceBundleSha256=bundle,
                sha256=actual, relationship=kind, **extra)

def add(*args, **kwargs):
    shots.append(record(*args, **kwargs))

catalog = read(BASE / 'app-r03-r04/FINAL_SCREENSHOT_MANIFEST.json')
for q in catalog['shots']:
    ids = ids_for(q)
    # The actual after-play frame establishes an association with media viewing,
    # not reconstruction of every control in the standalone 14 design.
    if q['case'] == '36-production-review-preview' and 'after-play' in q['file']:
        ids = ids_for(ids, '22:1093')
    add(BASE/'app-r03-r04'/q['file'], q['case'], q['width'], ids,
        q['sourcebundlehash'], q['capture_sha256'], route=q.get('route'))

business = read(BASE / 'app-r05-r12/review/SELECTED_MANIFEST.json')
for q in business['screenshots']:
    add(q['file'], q['case'], q['width'], ids_for(q),
        q['sourceBundleSha256'], q.get('sha256'),
        evidenceKind=q.get('evidenceKind'), visualStateStub=q.get('visualStateStub'),
        referenceRelationship=q.get('referenceRelationship'), position=q.get('position'))

foundation = read(BASE/'foundation-review/CAPTURE_INVENTORY.json')
bundles = {q['group']:q['app_bundle_sha256'] for q in foundation['sources']}
for q in foundation['screenshots']:
    ids = ids_for(q)
    if q['name'] == 'story-draft':
        ids = ids_for(ids, '2004:4260')
    if q['name'] == 'invoices':
        ids = ids_for(ids, '2004:5621')
    add(BASE/'foundation-review'/q['copiedFile'], q['name'], q['width'], ids,
        bundles[q['group']], q['sha256'], route=q.get('route'), position=q.get('position'))

shell_ids = {'home-artists':'2:69', 'home-videos':'2004:5895', 'home-city-picker':'2:69',
             'home-videos-city':'2004:5895', 'audition':'2:72', 'notices':'2:75',
             'messages':'2:78', 'my':'2:81', 'login':'22:541', 'account':'2004:4535',
             'agreement':'22:1153', 'privacy':'22:1153'}
shell = read(BASE/'shell-review/SHELL_RESULTS.json')
for q in shell['results']:
    name = re.sub(r'-[0-9]+$', '', q['name'])
    ids = [shell_ids[name]] if name in shell_ids else []
    if name == 'my':
        ids.append('2004:6248')
    add(BASE/'shell-review'/q['file'], name, q['viewport']['width'], ids,
        shell['app_bundle_sha256'], q['sha256'])

# Only these known captures are eligible. closures used the wrong backend and
# INITIAL files are failed attempts; neither may become acceptance evidence.
last_base = BASE/'last-details'
report_paths = [
    'story/STORY_RESULTS.json', 'extra/EXTRA_RESULTS.json',
    'business/DETAIL_390_RESULTS.json', 'business/DETAIL_320_RESULTS.json',
    'business/DETAIL_RECHECK_390_RESULTS.json', 'narrow/NARROW_320_RESULTS.json',
    'real-states/EXTRA_RESULTS.json', 'invitation/EXTRA_RESULTS.json',
    'finance/FINANCE_RESULTS.json', 'finance/320/FINANCE_RESULTS.json',
    'error-final/STATE_RESULTS.json',
]
last_groups = {}
excluded_cases = []
for name in report_paths:
    path = last_base/name
    if not path.exists():
        continue
    doc = read(path)
    assert doc.get('synthetic_only') is True, path
    bundle = doc.get('sourceBundleSha256', doc.get('source_bundle_sha256', doc.get('app_bundle_sha256')))
    source_reports[relative(path)] = dict(sha256=digest(path),
        collectionResult=doc.get('result'), sourceBundleSha256=bundle)
    # root explicitly approved the successful four controlled captures. A FAIL
    # file is not used, even when it remains next to the successful report.
    controlled = name == 'error-final/STATE_RESULTS.json'
    if controlled:
        assert doc.get('controlled_faults_not_business_facts') is True, path
        assert doc.get('result') == 'CAPTURED_PENDING_VISUAL_REVIEW', path
        assert not doc.get('errors') and not doc.get('business_writes'), path
        assert len(doc.get('screenshots', [])) == 4, path
    cases = {c.get('case', c.get('name')):c for c in doc.get('results', [])}
    groups = collections.defaultdict(list)
    for q in doc.get('screenshots', []):
        case = q.get('case', q.get('name'))
        if not case:
            candidates = [c for c in cases if q['file'].startswith(c+'-')]
            assert candidates, (path, q['file'])
            case = max(candidates, key=len)
        c = cases[case]
        result = c.get('status', c.get('state', 'CAPTURED'))
        if result in ['FAIL', 'FAILED']:
            excluded_cases.append(dict(sourceReport=relative(path), case=case, reason=result))
            continue
        ids = ids_for(q, c)
        assert ids, (path, case)
        kind = 'CONTROLLED_FAULT_STATE_UI_ONLY' if controlled else 'FINAL_LOCALIZED_RECHECK'
        shot = record(path.parent/q['file'], case, q['width'], ids,
            q.get('sourceBundleSha256', bundle), q['sha256'], kind,
            route=q.get('route', c.get('route')), position=q.get('position'),
            sourceReport=relative(path), sourceReportSha256=digest(path),
            captureResult=result, stateControl=q.get('stateControl'),
            evidenceKind='CONTROLLED_HTTP_UI_STATE' if controlled else c.get('evidence_kind', 'REAL_LOCAL_API_SYNTHETIC_DATA'))
        groups[(case,q['width'])].append(shot)
    for key, group in groups.items():
        # Recheck reports later in report_paths replace every old scroll for
        # this case/width, while keeping unrelated widths from earlier captures.
        last_groups[key] = group
    for case, c in cases.items():
        if c.get('status') in ['FAIL', 'FAILED']:
            excluded_cases.append(dict(sourceReport=relative(path), case=case, reason=c['status']))

last_shots = [q for group in last_groups.values() for q in group]
finance_review_path = last_base/'finance/VISUAL_REVIEW.json'
finance_review = read(finance_review_path)
finance_shots = [q for q in last_shots if '/last-details/finance/' in q['file']]
assert finance_review['validation']['manual_pixel_review_completed'] is True
assert finance_review['validation']['selected_screenshot_count'] == len(finance_shots)
assert all(q['sourceBundleSha256'] == finance_review['sourcebundlehash'] for q in finance_shots)
exclusions = [dict(file=relative(path), sha256=digest(path),
                  reason='FAILED_CAPTURE_ATTEMPT_NOT_SELECTED')
              for path in sorted(last_base.rglob('INITIAL*.json'))]
exclusions += [dict(file=relative(path), sha256=digest(path),
                   reason='SUPERSEDED_PRE_LAYOUT_CAPTURE_NOT_SELECTED')
               for path in sorted(last_base.rglob('PRE_LAYOUT*.json'))]
closure = last_base/'closures/STORY_RESULTS.json'
if closure.exists():
    exclusions.append(dict(file=relative(closure), sha256=digest(closure),
        reason='WRONG_BACKEND_NETWORK_FAILURE_NOT_CLOSED_BUSINESS_STATE'))
last_manifest = dict(result='SELECTED_SUCCESSFUL_CASES_WITH_EXPLICIT_LIMITS',
    caseWidthCount=len(last_groups), screenshotCount=len(last_shots),
    selection='Latest successful case+width replaces the whole prior group; all final scrolls remain.',
    sources=source_reports, excludedReports=exclusions, excludedCases=excluded_cases,
    finalFinanceVisualReview=dict(file=relative(finance_review_path),
        sha256=digest(finance_review_path),
        sourceBundleSha256=finance_review['sourcebundlehash'],
        screenshotCount=len(finance_shots)),
    controlledFaultsAreBusinessFacts=False, screenshots=last_shots)
(last_base/'DETAIL_RESULTS.json').write_text(json.dumps(last_manifest,ensure_ascii=False,indent=2)+'\n')
replaced = set(last_groups)
shots = [q for q in shots if (q['case'],q['width']) not in replaced] + last_shots

mapping = read(MAPPING)
assert len(mapping['screens']) == len({q['figmaId'] for q in mapping['screens']}) == 103
known_ids = {q['figmaId'] for q in mapping['screens']}
assert all(set(q['figmaIds']) <= known_ids for q in shots)
not_state_verified = {'2004:4989','2004:5173','2004:5246','2004:5306',
                      '2004:5432','2004:6412','2004:6457','2004:6580'}
controlled_state_ids = {'2004:6412','2004:6457','2004:6580'}
closed = {'23:1261','2004:2461','2004:3564','2004:4444'}
associated_only = {
 '22:1093': '关联实际播放后的制作审片播放器；14号专屏全部控件、字幕和素材管理没有据此完成。',
 '2004:4260': '仅关联按品类模板保存的本人故事草稿；不是70号完整通用业务创作草稿库或分享能力。',
 '2004:5621': '仅关联同一发票未开放入口；企业税号表单和正式开票未启用，不采集无法提交的税务信息。',
}
notes = {
 '2004:4989':'PAYMENT无FAILED枚举；关闭状态不能冒充已确认失败。',
 '2004:5173':'生成服务关闭，无真实FAILED生成任务；只核对相关服务关闭入口。',
 '2004:5246':'会员中心与规则已检查，未单独生成本幅冻结状态资料。',
 '2004:5306':'未用真实充值制造恢复结果；相关规则与账本用例不等于本幅实拍。',
 '2004:5432':'未开放作品售前专属会话；商品详情不是本状态完成证据。',
 '2004:6412':'已通过受控HTTP503检查加载失败UI与恢复入口；不是正式服务真实故障或业务失败证明。',
 '2004:6457':'已通过受控HTTP401检查失权清理与登录入口；不是正式会话自然到期证明。',
 '2004:6580':'已对实际GET控制延迟后放行并捕捉读取UI；不是正式网络性能或请求成功率证明。',
 '2004:3302':'实拍为原合同编号读取及分域许可，统一合同目录仍有结构缺口。',
 '2004:4349':'实拍分域现货/制作/试镜；统一库与最近下载仍有结构缺口。',
 '2004:1871':'个人MCN合作与机构经营不是同一整页。',
 '2004:6012':'主壳系统频道入口与真实通知分开，不是统一摘要列表。',
 '2004:6127':'通告与权益分别可达，未形成原稿顶层聚合频道。',
 '2004:2726':'R12黑色金额区与细线事实行已校准。当前显示本人结算投影，须与整单分配和总额分别核对；应付、本人份额与已核实实付不能混算，合成资料不证明正式到账。',
 '2004:2818':'R12黑色可申请金额区与细线事实行已校准。剩余边界是本人可申请额度和私有附件核验口径，不能把附件保存当作银行卡绑定或出款成功；本轮未提交申请或办理真实付款。',
 **associated_only,
}
for q in shots:
    q['figmaRelationships'] = {
        node: 'ASSOCIATED_VISUAL_EVIDENCE_ONLY' if node in associated_only
        else 'CONTROLLED_STATE_UI_ONLY' if node in controlled_state_ids and q['relationship'] == 'CONTROLLED_FAULT_STATE_UI_ONLY'
        else q['relationship']
        for node in q['figmaIds']}
counts = collections.Counter()
for screen in mapping['screens']:
    node = screen['figmaId']
    matches = [q for q in shots if node in q['figmaIds']]
    # A reference establishes traceability, never completion of the named state.
    status = 'REVIEWED_RELATED_PAGES_WITH_DOCUMENTED_GAPS' if matches else 'MAPPED_WITHOUT_INDEPENDENT_SCREENSHOT'
    if node in closed:
        status = 'REVIEWED_CLOSED_ENTRY' if matches else 'CLOSED_ENTRY_NOT_SEPARATELY_CAPTURED'
    if node in not_state_verified:
        status = 'STATE_NOT_INDEPENDENTLY_VERIFIED'
    if node in controlled_state_ids and any(q['relationship'] == 'CONTROLLED_FAULT_STATE_UI_ONLY' for q in matches):
        status = 'CONTROLLED_STATE_UI_REVIEWED_NOT_BUSINESS_OUTCOME'
    if node in associated_only:
        status = 'ASSOCIATED_VISUAL_EVIDENCE_ONLY' if matches else 'MAPPED_WITHOUT_INDEPENDENT_SCREENSHOT'
    if node in {'2004:2726','2004:2818'} and any('/last-details/finance/' in q['file'] for q in matches):
        status = 'FINANCE_VISUAL_REVIEWED_WITH_DATA_SCOPE_LIMITS'
    screen['visualAcceptanceStatus'] = status
    screen['evidenceCoverage'] = dict(
        selectedScreenshots=matches, screenshotCount=len(matches),
        associationOnly=node in associated_only,
        controlledStateUiOnly=status == 'CONTROLLED_STATE_UI_REVIEWED_NOT_BUSINESS_OUTCOME',
        meaning='引用关系与视觉复核，不代表设计中全部数据、功能或状态均完成。',
        limitation=notes.get(node, '差异及后续条件见reportIssues；不存在的事实不填示例。'))
    screen['designSha256'] = digest(ROOT/screen['designEvidence'])
    counts[status] += 1

# Hash the current saved App and Web sources. This is a source snapshot, not a
# claim that captures from different bundles share the same compilation output.
source_files = {ROOT/path for path in mapping.get('sourceFingerprints', {})}
app_root = ROOT/'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app'
web_root = ROOT/'晶晶日上工程交接包/01_源码/frontend_ops_workspace'
source_files.update((app_root/'lib').rglob('*.dart'))
source_files.update(path for path in (web_root/'src').rglob('*') if path.is_file())
for root, names in [(app_root, ['pubspec.yaml','pubspec.lock']),
                    (web_root, ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html'])]:
    source_files.update(root/name for name in names if (root/name).is_file())
mapping['sourceFingerprints'] = {relative(path):digest(path) for path in sorted(source_files) if path.is_file()}
mapping['sourceFingerprintScope'] = '当前App lib、Web src及两端现有构建配置；只计算哈希，未修改源码；不替代各截图bundle哈希。'
mapping['status'] = 'REVIEWED_MAPPING_WITH_EXPLICIT_UNFINISHED_REQUIREMENTS'
mapping['countsByVisualAcceptanceStatus'] = dict(counts)
MAPPING.write_text(json.dumps(mapping, ensure_ascii=False, indent=2)+'\n')

unique = {q['file']:q for q in shots}
manifest = dict(result='REVIEWED_WITH_EXPLICIT_GAPS', designCount=103,
                screenshotCount=len(unique), classifications=dict(counts),
                all_103_pixel_perfect_claimed=False, screenshots=list(unique.values()),
                caseWidthReplacementPolicy=last_manifest['selection'],
                lastDetailsManifest=relative(last_base/'DETAIL_RESULTS.json'),
                lastDetailsManifestSha256=digest(last_base/'DETAIL_RESULTS.json'),
                mappingSha256=digest(MAPPING),
                currentSourceFingerprintCount=len(mapping['sourceFingerprints']),
                sourceBundleSha256s=sorted({q['sourceBundleSha256'] for q in shots}),
                source_delta='各批截图保留自己的构建和源清单哈希；源码指纹不是全部截图同源构建证明。')
(BASE/'GALLERY_MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
labels = {'ASSOCIATED_VISUAL_EVIDENCE_ONLY':'仅关联画面／能力未整页完成',
          'CONTROLLED_STATE_UI_REVIEWED_NOT_BUSINESS_OUTCOME':'受控状态UI已核对／非真实业务结果',
          'FINANCE_VISUAL_REVIEWED_WITH_DATA_SCOPE_LIMITS':'财务视觉已校准／保留数据与核验边界',
          'REVIEWED_RELATED_PAGES_WITH_DOCUMENTED_GAPS':'已核对相关页面／差异见报告',
          'MAPPED_WITHOUT_INDEPENDENT_SCREENSHOT':'已映射／缺独立实拍',
          'REVIEWED_CLOSED_ENTRY':'已核对关闭入口',
          'CLOSED_ENTRY_NOT_SEPARATELY_CAPTURED':'关闭能力／未单独实拍',
          'STATE_NOT_INDEPENDENTLY_VERIFIED':'本状态未独立验证'}
parts = ['''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新版前端逐页对照</title><style>
:root{color:#151515;background:#f3f1e8;font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}body{max-width:1200px;margin:auto;padding:28px}h1,h2{font-family:"Songti SC",serif;line-height:1.2}h1{font-size:44px}a{color:#a73124}nav{display:flex;gap:20px;flex-wrap:wrap}input,button{font:inherit;background:white;border:1px solid #cecbc2;padding:10px}button{cursor:pointer}details{border-top:1px solid #cecbc2;padding:15px 0}summary{cursor:pointer;font-size:20px;font-weight:600}.tag{font:12px/1.6 sans-serif;background:#151515;color:#f3f1e8;padding:5px 8px;display:inline-block;margin:8px}.compare{display:grid;grid-template-columns:minmax(200px,390px) 1fr;gap:24px}.compare img{width:100%;height:auto;display:block}.actual{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,260px));gap:12px;align-items:start}figure{margin:0}figcaption,small{font-size:12px;color:#66645f;word-break:break-word}.missing{padding:24px;background:#e7e4da}.metadata{overflow-wrap:anywhere}code{font-size:12px}footer{border-top:1px solid #151515;margin-top:40px;padding:24px 0}@media(max-width:650px){body{padding:18px}h1{font-size:34px}.compare{grid-template-columns:1fr}summary{font-size:17px}}
</style><body><p>2026-10-23 · 晶晶日上 · Experience</p><h1>新版前端<br>逐页设计与实际画面</h1><p>103幅原稿逐一映射。这里区分已核对页面、关闭入口及未独立验证状态，保留全部需求与设计差异；不是“103幅全部逐像素通过”。</p><nav>''',
 f'<a href="{href(ROOT/"docs/reviews/figma-frontend-restore-20261023/REPORT.md")}">需求与设计问题报告</a>',
 '<a href="foundation-review/index.html">故事与新入口</a><a href="app-r03-r04/index.html">艺人与制作</a><a href="app-r05-r12/review/index.html">第5—12轮</a><a href="web-review/index.html">PC与窄屏工作台</a></nav>',
 f'<p>选用实际截图 {len(unique)} 张；各自保留构建哈希，最后局部修改单列。PC没有逐屏Figma稿，按同一系统适配。</p>',
 '<label>按页名、路由或问题号查找 <input id="filter" type="search" placeholder="例如：合同、R10、/wallet"></label> <button id="expand">展开全部</button><p id="count"></p>']
for s in mapping['screens']:
    status=s['visualAcceptanceStatus']; matches=s['evidenceCoverage']['selectedScreenshots']
    def order(q):
        suffix = re.search(r'(?:scroll-|fields-|[-_])([0-9]+)(?:\.png)?$', q['file'])
        position = q.get('position')
        step = position if isinstance(position, int) else int(suffix[1]) if suffix else 0
        return (q['relationship'] not in ['FINAL_LOCALIZED_RECHECK','CONTROLLED_FAULT_STATE_UI_ONLY'],
                q['width'] != 390, q['case'], q['width'], step, q['file'])
    chosen = sorted(matches, key=order)
    search=' '.join([s['figmaName'],*s['routes'],*s.get('reportIssues',[])])
    parts.append(f'<details class="screen" data-search="{html.escape(search,quote=True)}"><summary>{html.escape(s["figmaName"])} <small>{s["figmaId"]}</small><span class="tag">{labels[status]}</span></summary>')
    parts.append(f'<p>{html.escape(s["evidenceCoverage"]["limitation"])}</p><p class="metadata">当前路径：{html.escape(" · ".join(s["routes"]) or "当前无对应独立路由")}<br>报告：{html.escape("、".join(s.get("reportIssues",[])) or "通用适配及检查边界")}</p><div class="compare">')
    design=ROOT/s['designEvidence'];assert design.exists()
    parts.append(f'<figure><a href="{href(design)}"><img loading="lazy" src="{href(design)}" alt="{html.escape(s["figmaName"],quote=True)} 原设计"></a><figcaption>原Figma导出 · 点击原图</figcaption></figure><div>')
    if chosen:
        parts.append('<div class="actual">')
        for q in chosen:
            path=ROOT/q['file'];parts.append(f'<figure><a href="{href(path)}"><img loading="lazy" src="{href(path)}" alt="{html.escape(q["case"],quote=True)} 实际画面"></a><figcaption>{html.escape(q["case"])} · {q["width"]}px<br>构建 {q["sourceBundleSha256"][:12]}</figcaption></figure>')
        parts.append('</div>')
    else:parts.append('<p class="missing">当前没有与本幅独立对应的实际截图。请按上方状态与报告核对；不以相近页面冒充验收。</p>')
    parts.append(f'<p>本节点选图 {len(matches)} 张，以上保留所选case/width的全部滚动片段；来源与真实状态另见分域图册和 <a href="GALLERY_MANIFEST.json">哈希清单</a>。</p></div></div></details>')
checks_link = '<a href="CHECKS.json">检查记录</a> · ' if (BASE/'CHECKS.json').is_file() else ''
parts.append('''<footer>仅隔离合成资料。截图不证明正式付款、实名、签署、生成、影像质量或另一位同事审阅。<br><a href="CHECKS.json">检查记录</a> · <a href="GALLERY_MANIFEST.json">全部选图与哈希</a></footer><script>
const input=document.getElementById('filter'),rows=[...document.querySelectorAll('.screen')];function apply(){const term=input.value.trim().toLowerCase();let n=0;for(const r of rows){r.hidden=!r.dataset.search.toLowerCase().includes(term);if(!r.hidden)n++;}document.getElementById('count').textContent='显示 '+n+' / 103 幅';}input.addEventListener('input',apply);document.getElementById('expand').onclick=()=>{const open=rows.some(r=>!r.hidden&&!r.open);rows.filter(r=>!r.hidden).forEach(r=>r.open=open);};apply();</script></body></html>'''.replace('<a href="CHECKS.json">检查记录</a> · ', checks_link))
(BASE/'index.html').write_text(''.join(parts))
print(json.dumps({'designs':103,'screenshots':len(unique),'classifications':dict(counts)},ensure_ascii=False))
