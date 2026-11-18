"""Attach actual backend run evidence without granting product acceptance."""
from pathlib import Path
import argparse,json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
ROUTES=[
('现成视频',['stock.integration','stock-commercial.integration','stock-media.integration']),
('私人故事与人工定制',['customization.integration','customization-trade.integration','customization-delivery.integration','customization-contract-cutover.integration','copyright.integration']),
('试镜',['auditions.integration','auditions-supplements.integration']),
('通告与商单',['notices.integration','gigs.integration','marketplace-contract.integration']),
('共创',['cocreation.integration','story-room-journey.integration']),
('晶钻与制作金',['wallet.integration','redemption.integration','redemption-checkout.integration']),
('抽奖与奖品',['redemption-lottery.integration','redemption-checkout.integration','contract-pool']),
('余额与会员',['wallet.integration','consumer-controls.integration','consumer-risk.integration']),
('成长与月冠军',['engagement.integration']),
('机构与艺人',['party.integration','artists.integration','gigs.integration','contract-six.integration']),
('隐私与注销',['privacy.integration','privacy-actions.integration','privacy-execution.integration','usage.integration']),
('参演与发行',['participation.integration','participation-amendment.integration','project-income.integration','release.integration'])]
TASKS={
1:['stock.integration','auditions.integration'],2:['stock-commercial.integration','artists-contract.integration'],3:['stock.integration'],
4:['privacy-execution.integration'],5:['stock-media.integration','artists.integration'],6:['directory.integration'],7:['discovery.integration','catalog-city'],
8:['collections.integration'],9:['support.integration'],10:['notifications.integration'],11:['personal-center.integration'],
12:['invoices.integration'],13:['phone-change.integration'],14:['wallet-totals'],15:['story-room-journey.integration','customization.integration'],
16:['trade-providers','providers','test-isolation','legacy-truthfulness']}
DEL={
1:['party.integration','account-api.integration'],2:['artists.integration','commerce-admission'],3:['artists.integration'],
4:['discovery.integration','directory.integration'],5:['stock.integration','manual-sample.integration','customization.integration'],
6:['stock.integration'],7:['customization-contract-cutover.integration','trade.integration'],8:['marketplace-contract.integration','finance-rounding-contract'],
9:['auditions.integration'],10:['notices.integration'],11:['notices.integration'],12:['auditions-supplements.integration','gigs.integration'],
13:['script-intake.integration'],14:['customization.integration'],15:['legacy-video-manual','customization-delivery.integration'],
16:['cocreation.integration'],17:['wallet.integration'],18:['wallet.integration'],19:['engagement.integration'],20:['engagement.integration'],
21:['redemption-lottery.integration','contract-pool'],22:['redemption.integration'],23:['privacy.integration','privacy-execution.integration'],
24:['supply.integration','storage'],25:['gigs.integration','party.integration'],26:['operations.integration'],27:['participation.integration']}
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('run');a=ap.parse_args()
 run=(ROOT/a.run).resolve();assert run.is_relative_to(ROOT/'.local') and run.is_dir()
 summary=json.loads((run/'summary.json').read_text(encoding='utf-8'));assert summary['result'] in ('PASS','PASS_WITH_SKIP'),summary
 assert not summary['missing_files'] and not summary['changed_sources']
 checks=[json.loads(s) for s in (run/'checks.jsonl').read_text(encoding='utf-8').splitlines() if s.strip()]
 manifest=json.loads((run/'source-manifest.json').read_text(encoding='utf-8'))
 for s in manifest['sources']:
  current=hashlib.sha256((ROOT/s['path']).read_text(encoding='utf-8',errors='replace').replace('\r\n','\n').encode()).hexdigest()
  assert current==s['sha256'],'Source changed: '+s['path']
 ev=ROOT/'docs/testing/evidence/backend-closure-20261103';ev.mkdir(parents=True,exist_ok=True)
 for name in ['summary.json','source-manifest.json','checks.jsonl','backend.tap']:shutil.copyfile(run/name,ev/name)
 register=ROOT/'docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json';data=json.loads(register.read_text(encoding='utf-8'))
 allitems={i['id']:i for i in data['items']+data['supplemental_items']}
 report={'result':'PARTIAL_EVIDENCE','environment':'isolated','run_id':summary['run_id'],'base_commit':summary['base_commit'],
 'source_manifest':{'path':str((ev/'source-manifest.json').relative_to(ROOT)).replace('\\','/'),'sha256':sha(ev/'source-manifest.json')},
 'contract_version':data['release']['contract_version'],'formal_acceptance_updated':False,
 'limits':'Actual backend module tests only. No App/Web same-record journey, independent review, production provider or final product acceptance is asserted.',
 'artifacts':[{'path':str((ev/n).relative_to(ROOT)).replace('\\','/'),'sha256':sha(ev/n)} for n in ['summary.json','checks.jsonl','backend.tap']],
 'items':[]}
 def item(check_id,acceptance_id,title,files):
  names=['test/'+f+'.test.cjs' for f in files];rows=[(idx+1,c) for idx,c in enumerate(checks) if c['file'] in names]
  for name in names:assert any(c['file']==name for _,c in rows),name
  assert all(c['status']=='PASS' for _,c in rows),(check_id,[c for _,c in rows if c['status']!='PASS'])
  source=allitems[acceptance_id]
  report['items'].append({'id':check_id,'acceptance_id':acceptance_id,'title':title,
   'expected':source.get('effective_expected',source.get('source_expected','')),
   'result':'BACKEND_CHECKS_PASSED_PARTIAL','test_files':names,'check_lines':[n for n,_ in rows],
   'actual':str(len(rows))+'项相关后端检查通过；包含父项计数，不是功能数。',
   'remaining':'本关联仅证明所列测试行为；仍须对照完整预期核同一业务记录、全部异常、所需页面及独立审阅。真实服务与模拟结果分开。'})
 for n,(title,files) in enumerate(ROUTES,1):item('ROUTE-'+str(n).zfill(2),'E2E-'+str(n).zfill(2),title,files)
 for n,files in TASKS.items():item('TASK-BACKEND-'+str(n).zfill(2),'TASK-'+str(n).zfill(2),allitems['TASK-'+str(n).zfill(2)].get('work','第'+str(n)+'组后端'),files)
 for n,files in DEL.items():
  aid='ACC-DEL-'+str(n).zfill(2)+'.01';item('SOURCE-BACKEND-'+str(n).zfill(2),aid,allitems[aid]['work'],files)
 dump(ev/'acceptance-links.json',report)
 ref={'path':str((ev/'acceptance-links.json').relative_to(ROOT)).replace('\\','/'),'sha256':sha(ev/'acceptance-links.json')}
 before=[(i['id'],i['status']) for i in allitems.values()]
 for c in report['items']:
  target=allitems[c['acceptance_id']]
  target['partial_evidence']=[x for x in target.get('partial_evidence',[]) if x['artifact']['path']!=ref['path']]
  target['partial_evidence'].append({'artifact':ref,'checks':[c['id']],'scope':'后端实际运行关联；完整预期和全部所需端尚未验收，不代表正式PASS'})
 assert before==[(i['id'],i['status']) for i in allitems.values()]
 data['backend_closure_20261103']={'report':ref,'run_id':summary['run_id'],'links':len(report['items']),'formal_status_changed':False}
 dump(register,data)
 partial=sum(bool(i.get('partial_evidence')) for i in allitems.values())
 lines=['# 本轮后端验收证据与剩余工作','',
 '后端负责人 chengcongcong222；前端负责人 Bill-Billion。原18组、12条路线、151条标准不变。','',
 '当前完整后端检查：'+json.dumps(summary['counts'],ensure_ascii=False)+'。所有'+str(len(manifest['test_files']))+'个测试文件均有实际结果；跳过原因见summary.json。测试父项和子项均计数，不能换算成功能数量。','',
 '修复后的源文件摘要、运行日志和逐项结果均在本目录；不是沿用上轮检查。正式验收状态保持原值，本轮新增关联'+str(len(report['items']))+'条，合计'+str(partial)+'条有局部证据。','',
 '|原路线|实际后端检查|下一步谁做什么|','|---|---|---|']
 for c in report['items'][:12]:
  lines.append('|'+c['acceptance_id']+' '+c['title']+'|'+str(len(c['check_lines']))+'项相关检查通过|后端继续核完整预期及跨端；前端修页面问题，不能以模块检查替代同单验收|')
 lines+=['','所有对应原文预期、实际测试文件及逐项结果行号见 acceptance-links.json 和 checks.jsonl；原登记仍需独立审阅。','',
 '本轮没有新前端提交；四组页面仍为财务、消费确认、抽奖公示/确认、休息/夜间/推送设置，发布不等于认领。真实昆山服务及正式规则另验，OSS上线前最后处理。','']
 (ev/'RESULTS.md').write_text('\n'.join(lines),encoding='utf-8',newline='\n')
 print(json.dumps({'links_added':len(report['items']),'partial_total':partial,'formal_status_changed':False,'counts':summary['counts']},ensure_ascii=False))
if __name__=='__main__':main()
