"""Index the current evidence without promoting evidence coverage to completion."""
from pathlib import Path
import json, hashlib, collections

ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
def read(p):return json.loads(p.read_text(encoding='utf8'))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

catalog=ROOT/'docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json'
data=read(catalog);all_items=data['items']+data['supplemental_items']
counts=dict(collections.Counter(x['status'] for x in all_items))
assert counts=={'PASS':19,'PARTIAL':124,'NOT_RUN':8},counts

# These are reviewed changes to specific old remaining statements, not exhaustive closure.
resolved={
 'ACC-DEL-01.04':('明确企业代表、现货/票据、试镜、通告/主动邀请/直接商单、定制四阶段多代表接续已有后端证据；旧“普通员工代办未实现/定制未接”的说法仅属当时状态。其他入口尚须完整枚举，不能据此宣布全部覆盖。',['pm01-enterprise-representatives-20261114','pm01-audition-representative-20261114','pm01-notice-representative-20261114','pm01-invitation-representative-20261114','pm01-customization-representative-20261114','pm01-delivery-handoff-20261114']),
 'ACC-DEL-09.02':('旧证据中拒接/未履约退款与成长佣金的缺口已有后续组合；正常试镜履约原推荐结佣亦有后续HTTP证据，不再按旧待办重复开发。真实清分、所有场景与所需端并未因此完成。',['pm01-unfulfilled-refund-20261114','pm01-referral-audition-fulfilled-20261114']),
 'ACC-DEL-20.03':('定制、试镜、商单正常履约推荐结佣、原银行回款与独立追偿已由后续批次推进；旧“缺追偿案件”已过时。原件/真实回款、准备金及全业务独立财务仍须另核。',['pm01-referral-customization-20261114','pm01-referral-audition-fulfilled-20261114','pm01-referral-commercial-fulfilled-20261114','pm01-recovery-case-20261114']),
 'ACC-DEL-20.04':('已实现原订单独立追偿案件、独审和分次回款关联，以及本人追偿摘要/选定同申请文件交付；旧“缺案件本人副本/企业定制代办”分别已由后续补充，不代表真实追偿完成。',['pm01-recovery-case-20261114','pm01-recovery-copy-20261114','pm01-customization-representative-20261114','pm01-delivery-handoff-20261114']),
 'ACC-DEL-23.01':('本轮补办理人自己的交稿读取、签收、反馈摘要及同申请独审文件；完整资料、自由文本与受控原件仍需按实际请求核对，不能把新增两个分类当全量提供。',['pm01-production-copy-20261114']),
}
rows=[]
for x in all_items:
 if x['status']!='PARTIAL':continue
 links=x.get('partial_evidence',[]);refs=[]
 for e in links:
  p=ROOT/e['artifact']['path'];assert p.is_file() and sha(p)==e['artifact']['sha256'],str(p)
  d=read(p);records=d.get('checks',d.get('items',[]))
  if not isinstance(records,list):records=[]
  matching=[c for c in records if isinstance(c,dict) and c.get('id') in e['checks']]
  refs.append({'artifact':e['artifact'],'check_ids':e['checks'],'registered_scope':e.get('scope'),
    'matched_records':[ {k:c[k] for k in ['id','name','work','title','scope','actual','remaining','limits','test_files'] if k in c} for c in matching],
    'artifact_limits':d.get('limits'),'index_only':True})
 current,reports=resolved.get(x['id'],('证据已登记；本轮只核索引和原记录范围，没有重新逐分支审查当前代码。未开发总数仍不详；历史剩余须与后续代码和报告逐项对账。',[]))
 report_refs=[]
 for name in reports:
  p=ROOT/'docs/reviews'/name/'REPORT.md';assert p.is_file(),p
  report_refs.append({'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)})
 rows.append({'id':x['id'],'work':x.get('work',x.get('title',x.get('name',x.get('effective_expected',x['id'])[:70]))),'status':x['status'],'expected':x.get('effective_expected',x.get('source_expected')),
  'required_cases':x.get('required_cases',[]),'required_surfaces':x.get('required_surfaces',[]),'historical_evidence':refs,
  'current_review':current,'current_report_refs':report_refs,'whole_standard_code_audited_this_round':False,'formal_status_changed':False})
out={'kind':'REMAINING_EVIDENCE_INDEX_NOT_COMPLETION_AUDIT','catalog':{'path':catalog.relative_to(ROOT).as_posix(),'sha256':sha(catalog)},'counts':counts,
 'original_groups':{'closed':0,'total':18},'routes':{'partial':12,'closed':0},'unimplemented_total':None,
 'method':'Verify registered artifact hashes; resolve matching checks or items; preserve original historical scope. Five selected standards have explicit later-report reconciliation. An index, missing remaining field, old generic limitation or test count is not proof of a missing feature or completed standard.',
 'not_run':[{'id':x['id'],'work':x.get('work',x.get('title',x.get('name',x.get('effective_expected',x['id'])[:70]))),'meaning':'未登记足够正式证据，不等于未开发'} for x in all_items if x['status']=='NOT_RUN'],
 'partial_items':rows}
(HERE/'REMAINING_EVIDENCE_INDEX.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
md=['# 124项部分验收的证据索引','', '本表核对登记证据及其摘要，不是逐项代码审计，也不提高任何验收状态。五项标准的过时待办在“当前复核”列明确纠正；其余仍须逐条对照代码、后续报告及原要求。具体可独立后端收尾顺序见 [阶段收尾清单](STAGE_REMAINING.md)。','', '|标准与工作|登记的最近证据|当前复核|','|---|---|---|']
for r in rows:
 e=r['historical_evidence'][-1] if r['historical_evidence'] else None
 link='无登记' if not e else '['+Path(e['artifact']['path']).parent.name+'](../../../'+e['artifact']['path']+')'
 md.append('|'+r['id']+' '+r['work']+'|'+link+'|'+r['current_review'].replace('|','／')+'|')
(HERE/'REMAINING_EVIDENCE_INDEX.md').write_text('\n'.join(md)+'\n',encoding='utf8',newline='\n')
print(json.dumps({'counts':counts,'partial_indexed':len(rows),'selected_reconciled':len(resolved),'formal_promotions':0},ensure_ascii=False))
