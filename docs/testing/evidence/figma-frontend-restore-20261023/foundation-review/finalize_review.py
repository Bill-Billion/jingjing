from pathlib import Path
import json, html, hashlib
OUT=Path(__file__).resolve().parent
inventory=json.loads((OUT/'CAPTURE_INVENTORY.json').read_text())
findings=[
 {'id':'F01','kind':'VISUAL','priority':'P2','status':'REPORTED_TO_ROOT','title':'可编辑字段底色与边界需校准','description':'64/09/74原稿以白色字段块和底部细分隔线区分输入区；当前截图的可编辑字段为纸色底、四周描边。只影响视觉，不应改变校验或可用状态。','screens':['story-new-family','story-new-life','story-draft','story-supplement','search','help'],'requestedFix':'检查共享输入主题及表单局部覆盖，按原稿校准白色填充与边界；变更后重拍受影响页面。'},
 {'id':'F02','kind':'VISUAL','priority':'P2','status':'REPORTED_TO_ROOT','title':'目录页签选中标记应为短红线','description':'09与72原稿为选中文字下方的短朱红线；当前截图使用完整红色矩形边框。','screens':['search','saved'],'requestedFix':'页签保留既有状态与点击，只将边框改成文字下方短红线。'},
 {'id':'F03','kind':'PRODUCT_COPY','priority':'P2','status':'REPORTED_TO_ROOT','title':'报价付款分项暴露内部节点键','description':'已审报价的分项展开标题显示“节点 first / interim / last · 分项金额”，与原稿业务用语不一致。','screens':['approved-quote'],'requestedFix':'采用首款、中间款、尾款等现有业务节点名称；未知历史节点使用可读通用说明。'},
 {'id':'F04','kind':'CAPTURE_COVERAGE','priority':'P2','status':'REPORTED_TO_ROOT','title':'768px草稿首屏及帮助页末端需补拍','description':'story-draft-768-0.png正文从“业务草稿”开始，没有截图中应出现的eyebrow与“写下你的故事”，疑似滚动位置未复位；help-768-0.png未包括末端业务/反馈按钮。仅可证明已经入镜的片段可读。','screens':['story-draft','help'],'requestedFix':'明确复位页面内部滚动区域后补拍768px草稿首屏，并补齐帮助页底部。'},
 {'id':'F05','kind':'VISUAL_STATE','priority':'P2','status':'REPORTED_TO_ROOT','title':'权限与下架提示尚未采用专门状态稿构图','description':'C08/C09原稿为独立大标题、状态块及返回业务动作。当前截图沿用来源页面标题加普通提示，权限闭锁和隐藏私有内容正确，不能据此判定专门状态稿已完整还原。','screens':['private-forbidden','stock-unlisted-public'],'requestedFix':'在保持真实权限和订单访问规则的前提下，统一状态标题、提示块和返回动作；否则在最终报告保留此视觉差距。'},
 {'id':'F06','kind':'EVIDENCE_LIMIT','priority':'P2','status':'DOCUMENTED','title':'空目录与编号读取不覆盖设计中的有数据列表','description':'foundation的54号只有空订单列表；59号只有按合同编号读取入口。无法据此验收原稿中的有数据订单分类和多合同目录。story原有quote-detail三个宽度为404权限关闭态；56号正向界面由extra的approved-quote六个滚动片段补充，仍未包含确认后下单结果。','screens':['orders','contract-directory','quote-detail'],'requestedFix':'由其他截图集补齐实际有数据状态，或在最终覆盖矩阵明确记录缺口。'},
]

resolved = {
 'F01': ('可编辑字段白底与底线：复核通过', '最新63张中，故事表单、查找及帮助字段已恢复白色填充与底部细线；纸色透明底和四周框已移除。少量顶部圆角另列F07。', ['screenshots/story-story-new-family-390-1.png','screenshots/story-story-draft-320-1.png','screenshots/extra-search-390-0.png','screenshots/extra-help-390-0.png']),
 'F02': ('目录页签短红线：复核通过', '09查找与72收藏页签的红色整框已改为选中文字下方短朱红线，390/320/768查找及390收藏截图均可核对。', ['screenshots/extra-search-390-0.png','screenshots/extra-search-320-0.png','screenshots/extra-search-768-0.png','screenshots/extra-saved-390-0.png']),
 'F03': ('报价付款分项业务名称：复核通过', '已审报价付款展开标题按实际trigger显示中文确认订单后付款、定制中间补款条件确认后付款、成片验收后付款，不再出现first/interim/last内部节点键。', ['screenshots/extra-approved-quote-390-2.png','screenshots/extra-approved-quote-390-3.png']),
 'F04': ('768px草稿首屏及帮助末端补拍：复核通过', '新的草稿768px首屏包含“人工定制 / 故事需求”和“写下你的故事”；帮助768px已补充完整末端业务、反馈记录及灰显提交按钮，已查看完整原图。', ['screenshots/story-story-draft-768-0.png','screenshots/extra-help-768-1.png','screenshots/extra-help-768-5.png']),
}
for f in findings:
 if f['id'] in resolved:
  title, description, evidence = resolved[f['id']]
  f.update(status='FIXED_VISUALLY_VERIFIED', title=title, description=description, requestedFix='已在指定最终构建实拍复核，无须继续此项修正。', verificationEvidence=evidence)
findings.append({'id':'F07','kind':'MINOR_VISUAL','priority':'P3','status':'ROOT_CODE_CHANGED_PENDING_TARGETED_VISUAL','title':'白色字段顶部仍有轻微圆角','description':'最终构建的白色输入块上角仍约4px圆角，原稿为直角；白底与底线修复已通过，这项为单独的微小几何差距。','screens':['story-new-family','story-new-life','story-draft','story-supplement','search','help','contract-directory','public-empty'],'requestedFix':'root已报告显式设置borderRadius为零，后续由root的最后定点截图确认。本目录固定d5fd658a的63张证据，不把未在此目录实拍的修正标成视觉通过。'})
expected_bundle='d5fd658abda9162dabecf980b20eb5c1e6ca236099d506453c215cc309d00625'
assert len(inventory['screenshots']) == 63
assert all(s['app_bundle_sha256'] == expected_bundle for s in inventory['sources'])

rows=[]
for c in inventory['cases']:
 name=c['name'];width=c['width'];group=c['group'];flags=[];verdict='REVIEWED_BUSINESS_ADAPTATION'
 observations=['纸色、墨色、宋体标题、矩形动作与细分隔线沿用校准方向；已入镜内容无横向溢出，有底部片段的页面末项未被固定底栏遮挡。']
 adaptation='按最新需求和服务器返回的真实字段呈现，设计示例文案不作为真实数据。'
 if name.startswith('story-'):
  adaptation='64号的单张表单扩展为品类模板、业务草稿、正式提交、逐项补充和办理进度；保留当前实际流程，不能按示例压回固定故事字段。'
  observations.append('动态模板与状态信息可读；可编辑和只读内容被区分，底部动作与当前状态一致。')
 if name in ['story-new-family','story-new-life','story-draft','story-supplement','search','help']: flags.append('F01')
 if name in ['search','saved']: flags.append('F02')
 if name in ['story-new-family','story-new-life','story-draft','story-supplement','search','help','contract-directory','public-empty']: flags.append('F07')
 if name in ['story-draft','help'] and width==768:flags.append('F04')
 if name=='approved-quote':
  flags.append('F03');adaptation='展示当前已审合成报价的真实价格¥500与30/60/10付款节点，额外的权限、固定规则和原故事关联不能用设计示例金额替换。'
  observations.append('六张连续滚动片段覆盖报价主体、分项、付款节点、审核与固定财务说明；确认动作始终在固定底部。')
 if name in ['private-forbidden','stock-unlisted-public']:flags.append('F05')
 if name in ['orders','contract-directory','quote-detail']:flags.append('F06')
 if name=='quote-detail':
  verdict='NEGATIVE_STATE_ONLY';adaptation='该场景实际返回404并清空私有内容，属于关闭态；不能算作56号报价内容正向验收，正向证据见extra/approved-quote。'
 if name=='orders':
  verdict='EMPTY_STATE_ONLY';adaptation='当前隔离身份确无该类订单；不造设计示例订单。只验证空目录，未验收有数据列表。'
 if name=='contract-directory':
  verdict='DIRECTORY_DESIGN_GAP';adaptation='截图仅为现有合同编号读取入口，尚未验证原设计中的多合同分类列表。'
 if name=='private-forbidden':
  verdict='CLOSED_WITH_VISUAL_GAP';adaptation='来源故事记录404后正文被清空，显示无查看权限和重新核对入口；原稿专门状态构图仍有差距。'
 if name=='stock-unlisted-public':
  verdict='CLOSED_WITH_VISUAL_GAP';adaptation='作品未公开销售的409被明确显示，未展示原商品媒体或购买动作；已购权益是否继续可用需由原订单独立核对。'
 if name=='search':adaptation='只有已支持的城市、艺人标签与类型目录跳转；未开放的语义匹配关闭，没有伪造姓名、图片或匹配率。'
 if name=='producer-public':
  adaptation='公开名单只给主体编号、核实统计和资格；保留左纸右媒体槽构图，但不使用设计姓名肖像或把完成订单伪装为作品部数。'
  observations.append('390/320/768三宽的标题、媒体空槽、长主体编号、统计与关闭投稿可读。')
 if name in ['invoices','saved']:
  verdict='CLOSED_BUSINESS_ADAPTATION';adaptation='对应正式接口未接通；明确未开放并关闭申请/管理，不填示例票据或收藏、不采集无法提交的资料。'
 if name=='help':
  verdict='FAQ_USABLE_FEEDBACK_CLOSED';adaptation='已开放本地FAQ阅读与原业务跳转；反馈提交、附件、记录及统一客服尚未接通，不能按设计示例收集私人材料。'
 if name=='story-attachment-blocked':
  verdict='REQUIRED_ATTACHMENT_CLOSED';observations.append('必填私有附件槽明确关闭，正式提交按钮灰显，保存文字草稿仍保留。')
 if name=='public-empty':
  verdict='CONTEXTUAL_EMPTY_STATE';adaptation='C05原稿示例是收藏空态，本截图是现货目录无结果；按真实目录语境说明，不套用“没有收藏”。'
 open_flags=[fid for fid in flags if not fid in resolved]
 if open_flags and verdict=='REVIEWED_BUSINESS_ADAPTATION':verdict='REVIEWED_WITH_MINOR_VISUAL_GAP' if open_flags == ['F07'] else 'REVIEWED_WITH_FINDINGS'
 if 'F01' in flags: observations.append('已复拍确认字段白底与底线修复，细小上角圆角另记录F07。')
 if 'F02' in flags: observations.append('已复拍确认选中页签为文字下方短红线。')
 if 'F03' in flags: observations.append('付款分项标题已采用实际触发条件的中文名称。')
 if 'F04' in flags: observations.append('768px首屏/末端补拍已完整核对。')
 shots=[s for s in inventory['screenshots'] if s['group']==group and s['name']==name and s['width']==width]
 rows.append({'group':group,'name':name,'width':width,'route':c['route'],'figmaId':c['figmaId'],'referenceName':shots[0]['referenceName'],'referenceFile':shots[0]['referenceFile'],'verdict':verdict,'observations':observations,'businessAdaptation':adaptation,'findingIds':flags,'resolvedFindingIds':[f for f in flags if f in resolved],'openFindingIds':open_flags,'screenshots':[s['copiedFile'] for s in shots],'screenshotCount':len(shots),'reviewMethod':'实际逐张查看联系图；768px同时查看完整原图，避免缩略图裁切误判。'})
review={'result':'REVIEWED_WITH_REMAINING_GAPS','resolvedFindingCount':4,'remainingVisualFindingIds':['F05','F07'],'evidenceLimitFindingIds':['F06'],'verifiedAppBundleSha256':expected_bundle,'reviewDate':'2026-10-23','scope':'仅foundation截图对照审核，未改业务代码','caseCount':len(rows),'screenshotCount':len(inventory['screenshots']),'referenceCount':inventory['referenceCount'],'allScreenshotsActuallyViewed':True,'businessVerification':'NOT_INFERRED_FROM_SCREENSHOTS','syntheticOnly':True,'sources':inventory['sources'],'excludedFromPixelComparison':['系统状态栏、原型省略号和iPhone home indicator为Figma示意，网页截图不绘制假系统栏。','最新需求动态模板、实际字段与明确关闭动作优先；这些业务适配不等于与原稿逐像素相同。','768px为响应式实现，原设计390px无同宽独立稿；只验无溢出、内容宽度和动作可达。'],'findings':findings,'cases':rows,'screenshots':inventory['screenshots']}
(OUT/'VISUAL_REVIEW.json').write_text(json.dumps(review,ensure_ascii=False,indent=2)+'\n')
e=html.escape
css='body{margin:0;background:#f3f1e8;color:#151515;font:15px/1.7 system-ui,sans-serif}main{max-width:1440px;margin:auto;padding:32px}h1,h2{font-family:serif}a{color:#a73124}article,section{border-top:1px solid #cecbc2;padding:20px 0}.grid{display:flex;align-items:flex-start;gap:16px;overflow:auto}.shot{flex:0 0 320px}.shot img{width:320px;height:auto;display:block;border:1px solid #cecbc2}.label{background:#151515;color:#f3f1e8;padding:5px 10px}.note{color:#66645f}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #cecbc2;padding:8px;vertical-align:top}.contact{max-width:100%;height:auto}code{overflow-wrap:anywhere}'
parts=['<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Foundation逐页截图审核</title><style>'+css+'</style><main>', '<h1>Foundation逐页截图审核</h1>','<p>33 个页面/宽度案例，63 张最终构建实际滚动截图（story 32、extra 31），对照 12 幅 Figma 最终原图。白底底线、页签红线、付款分项文案及768px首尾补拍已逐张复核通过。仍保留状态稿差异、轻微圆角与证据范围限制；视觉审核不替代业务验收。</p>','<p>全部数据来自隔离合成环境。原始截图按哈希冻结保存，点击图片查看全尺寸。768px原图独立查看；联系图仅等比缩放。</p>', '<p>固定构建：<code>d5fd658abda9162dabecf980b20eb5c1e6ca236099d506453c215cc309d00625</code>。此目录不混入后续定点构建图片；零圆角后续由root补证。</p>', '<p><a href="VISUAL_REVIEW.json">结构化审核结果</a> · <a href="CAPTURE_INVENTORY.json">截图、来源与哈希清单</a></p>', '<h2>需要处理或保留的差距</h2><table><tr><th>编号 / 状态</th><th>问题与复核</th><th>处理建议</th></tr>']
for f in findings:parts.append(f'<tr><td>{f["id"]}<br>{f["kind"]}<br>{f["status"]}</td><td><b>{e(f["title"])}</b><br>{e(f["description"])}</td><td>{e(f["requestedFix"])}</td></tr>')
parts.append('</table><h2>逐页对照</h2>')
for r in rows:
 parts.append(f'<article id="{r["group"]}-{r["name"]}-{r["width"]}"><h2>{e(r["name"])} · {r["width"]}px</h2><p class="label">{e(r["verdict"])}'+(' · '+', '.join(r['findingIds']) if r['findingIds'] else '')+'</p>')
 parts.append(f'<p>{e(r["referenceName"])} · <code>{e(r["route"])}</code></p><p>{e(r["businessAdaptation"])}</p><p class="note">{e(" ".join(r["observations"]))}</p><div class="grid">')
 for label,path in [('Figma最终设计',r['referenceFile'])]+[(f'实际截图 · 滚动片段 {n}',p) for n,p in enumerate(r['screenshots'])]:parts.append(f'<div class="shot"><p>{e(label)}</p><a href="{path}"><img loading="lazy" src="{path}" alt="{e(label)}"></a></div>')
 parts.append('</div></article>')
parts.append('<h2>联系图</h2>')
for p in sorted((OUT/'contact').glob('*.png')):parts.append(f'<details><summary>{e(p.name)}</summary><a href="contact/{p.name}"><img class="contact" loading="lazy" src="contact/{p.name}" alt="{e(p.name)}"></a></details>')
parts.append('</main></html>')
(OUT/'index.html').write_text('\n'.join(parts))
manifest=[]
for p in sorted(OUT.rglob('*')):
 if p.is_file() and p.name!='MANIFEST.json':manifest.append({'file':str(p.relative_to(OUT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(OUT/'MANIFEST.json').write_text(json.dumps({'files':manifest},ensure_ascii=False,indent=2)+'\n')
print('reviewed',len(rows),'cases',len(inventory['screenshots']),'screenshots; findings',len(findings))
