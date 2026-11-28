import datetime, hashlib, json, os, shutil, sys
from pathlib import Path
r=Path.cwd(); src=r/'.local/backend-acceptance-2026-11-25T21-08-15-701Z-f6296e'; out=r/'.local/qa18/coverage-20261126-42'
load=lambda p:json.loads(p.read_text(encoding='utf8'))
manifest=load(src/'source-manifest.json'); summary=load(src/'summary.json')
assert summary['run_id']==manifest['run_id'] and not summary['changed_sources']
start=datetime.datetime.fromisoformat(manifest['started_at'].replace('Z','+00:00')).timestamp()
end=datetime.datetime.fromisoformat(summary['finished_at'].replace('Z','+00:00')).timestamp()
dest=out/'backend-complete'; dest.mkdir(exist_ok=False)
for name in ['source-manifest.json','summary.json','checks.jsonl','backend.tap']:shutil.copyfile(src/name,dest/name)
declared={x['fixtures'] for x in load(r/'scripts/runtime-contract-manifest.json')['entries']}
found={}; excluded=[]
for folder, dirs, names in os.walk(r/'.local'):
    dirs[:]=[d for d in dirs if d not in ['qa18','qa18-backups','node_modules','tools','stock-sandbox','ci-evidence','private-storage','preserved-files','files','sms','.git','mysql'] and not d.startswith('backend-acceptance-')]
    for name in names:
        p=Path(folder)/name
        if p.suffix!='.json' or not start<=p.stat().st_mtime<=end or p.stat().st_size>40*1024*1024:continue
        try:d=load(p)
        except (ValueError,UnicodeError):continue
        if not isinstance(d,dict) or not d.get('synthetic_only') or not d.get('cases'):continue
        cases=d['cases']
        if not isinstance(cases,list) or not all(isinstance(c,dict) and all(k in c for k in ['schema','value']) for c in cases):continue
        rel=p.relative_to(r).as_posix();b=p.read_bytes();f=dest/'http-private'/p.relative_to(r/'.local');f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(b)
        found[rel]=dict(path=rel,archived_path=f.relative_to(r).as_posix(),sha256=hashlib.sha256(b).hexdigest(),bytes=len(b),cases=len(cases),route_metadata_cases=sum('method'in c and'path'in c for c in cases),declared=rel in declared)
missing=sorted(declared-set(found)); result=dict(run_id=manifest['run_id'],backend_result=summary['result'],fresh_http_files=len(found),fresh_http_cases=sum(x['cases'] for x in found.values()),declared_missing_or_stale=missing,extra_actual_files=sorted(set(found)-declared),files=list(found.values()),no_formal_updates=True)
(out/'HTTP_COLLECTION_COMPLETE.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
assert not missing,missing
sys.path.insert(0,str(r/'scripts'));import validate_contract
report=validate_contract.validate([r/x['archived_path']for x in found.values()])
(out/'contract-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:result[k]for k in ['backend_result','fresh_http_files','fresh_http_cases','declared_missing_or_stale','extra_actual_files']}))
print(json.dumps({k:report[k]for k in ['result','runtime_response_cases','contract_version','failures']}));sys.exit(0 if report['result']=='PASS'else 1)
