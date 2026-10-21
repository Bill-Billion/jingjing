#!/usr/bin/env python3
"""只读核对D1编号、映射、来源、依赖与初始状态，不测业务代码。"""
from pathlib import Path
import json,hashlib,re,sys
R=Path(__file__).resolve().parents[1]
def read(n):return json.loads((R/'data'/n).read_text(encoding='utf8'))
def main():
 ps=read('delivery_packages.json');fs=read('full_scope.json');ts=read('paired_tasks.json');ac=read('acceptance.json');de=read('decisions.json');ex=read('external_evidence.json')
 ids={p['id'] for p in ps};fids={f['id'] for f in fs};aids={a['id'] for a in ac};di={x['id'] for x in de+ex}
 assert (len(ps),len(fs),len(ts),len(ac))==(30,121,60,133)
 assert len(ids)==30 and len(fids)==121 and len(aids)==133
 assert len({x['id'] for x in ts})==60
 for p in ps:
  assert set(p['dependencies'])<=ids
  assert set(p['decisions'])<=di
 for f in fs:
  assert f['package'] in ids; assert 'ACC-'+f['id'] in aids
 for t in ts:
  assert t['package'] in ids;assert set(t['acceptance_ids'])<=aids
  assert t['claimed_by'] is None; assert t['implementation']=='未开始'
 assert all(a['result']=='NOT_EXECUTED' for a in ac)
 graph={p['id']:p['dependencies'] for p in ps};done=set();active=set()
 def visit(n):
  assert n not in active, '循环依赖: '+n
  if n in done:return
  active.add(n)
  for v in graph[n]:visit(v)
  active.remove(n);done.add(n)
 for n in ids:visit(n)
 old=read('legacy_req_crosswalk.json');assert len(old)==60
 assert {x['id'] for x in old}=={f'REQ-{i:03d}' for i in range(1,61)}
 for x in old:
  assert x['packages'] or x['id']=='REQ-027'
  assert set(x['packages'])<=ids
 sp=read('prototype40_crosswalk.json');assert len(sp)==40
 for x in sp:assert x['packages'] and set(x['packages'])<=ids
 for x in read('sources.json'):
  if x['path']:
   p=R/x['path'];assert p.exists();assert hashlib.sha256(p.read_bytes()).hexdigest()==x['sha256']
 assert read('repository_snapshot.json')['merged'] is False
 assert read('repository_snapshot.json')['merge_commit_sha'] is None
 for p in R.rglob('*'):
  if p.is_file():assert p.name!='.env' and not p.name.endswith(('.pem','.key','.p12','.sqlite','.db','.apk'))
 # 本包本地阅读入口链接都应存在。
 html=(R/'00_阅读入口.html').read_text()
 for target in re.findall(r'href="([^"]+)"',html):
  if not target.startswith(('http','#')):assert (R/target).exists(),target
 print(json.dumps({'package':'D1','structure':'PASS','packages':30,'capabilities':121,'paired_tasks':60,'planned_acceptance':133,'legacy_req':60,'prototype_topics':40,'decisions':18,'external_groups':7,'cyclic_dependencies':False,'business_tests_run':False,'merge_performed':False},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
