#!/usr/bin/env python3
"""Synthetic self-test of registry plumbing only; NEVER represents any product acceptance."""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

TOOL = Path(__file__).with_name('qa18_registry.py')

def create(root, path, obj):
    p=root/path
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False)+'\n',encoding='utf-8')

with tempfile.TemporaryDirectory(prefix='qa18-selftest-') as t:
    r=Path(t)
    cases=[{'id':f'ACC-DEL-{i:02}.01','task_refs':['CORE-CLIENT-COMPLETE-'+f'{(i%16)+1:02}'], 'required_surfaces':['api'],'required_cases':['normal'],'status':'PARTIAL','source_expected':'test'} for i in range(121)]
    cases += [{'id':f'E2E-{i:02}', 'task_refs':['CORE-CLIENT-COMPLETE-17'], 'required_surfaces':['api','app','web'], 'required_cases':['normal','reverse','unauthorized','duplicate','state_change','recovery'],'status':'PARTIAL', 'source_expected':'test'} for i in range(1,13)]
    supp=[{'id':f'TASK-{i:02}','task_refs':[f'CORE-CLIENT-COMPLETE-{i:02}',f'UX-CLIENT-COMPLETE-{i:02}'], 'required_surfaces':['operations'],'required_cases':['normal'],'status':'PARTIAL','source_expected':'test'} for i in range(1,19)]
    create(r,'docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json',{'items':cases,'supplemental_items':supp})
    allitems=cases+supp
    tasklist=[]
    for n in range(1,19):
        for side in ('CORE','UX'):
            tid=f'{side}-CLIENT-COMPLETE-{n:02}'
            tasklist.append({'id':tid,'acceptance_ids':[x['id'] for x in allitems if tid in x['task_refs']]})
    create(r,'docs/tasks/board.json',{'tasks':tasklist})
    create(r,'docs/sources/pm03-20261115/dashboard-data.json',{'groups':[{'id':f'{i:02}','name':f'组{i}','exit':'mock'} for i in range(1,19)],'routes':[{'acceptance_id':f'E2E-{i:02}','name':f'链{i}'} for i in range(1,13)]})
    create(r,'docs/requirements/baseline.json',{'requirements':[{'id':f'REQ-{i:03}','scope':'IN_SCOPE'} for i in range(1,61)]})
    evidence='.local/sample.json'
    create(r,evidence,{'assertion_id':'synthetic-G01','status':'PASS'})
    def cli(*a, ok=True):
        run=subprocess.run([sys.executable, str(TOOL), '--root', str(r), *a],text=True,capture_output=True)
        if bool(run.returncode==0)!=ok:
            raise AssertionError((run.returncode,run.stdout,run.stderr,a))
        return run.stdout.strip() or run.stderr.strip()
    sha='a'*40
    init=cli('init','--run-id','test-cycle-01','--round','discovery','--backend-sha',sha,'--app-sha',sha,'--web-sha',sha,'--environment','synthetic-local-only')
    print('INIT',init)
    cli('record','--run-id','test-cycle-01','--criterion','TASK-01','--surface','operations','--case','normal','--outcome','PASS','--owner','synthetic-test','--note','not product test','--evidence',evidence,'--assertion','synthetic-G01','--exit-code','0','--environment','synthetic-local-only')
    cli('record','--run-id','test-cycle-01','--criterion','ACC-DEL-00.01','--surface','api','--case','normal','--outcome','FAIL','--owner','synthetic-test','--note','synthetic fail','--evidence',evidence,'--defect','TST-1')
    cli('record','--run-id','test-cycle-01','--criterion','ACC-DEL-00.01','--surface','api','--case','normal','--outcome','PASS','--owner','synthetic-test','--note','synthetic recheck','--evidence',evidence,'--assertion','synthetic-01','--exit-code','0','--environment','synthetic-local-only',ok=False)
    cli('record','--run-id','test-cycle-01','--criterion','ACC-DEL-00.01','--surface','api','--case','normal','--outcome','PASS','--owner','synthetic-test','--note','synthetic recheck','--resolution','synthetic fixture repaired','--evidence',evidence,'--assertion','synthetic-01','--exit-code','0','--environment','synthetic-local-only')
    cli('export','--run-id','test-cycle-01')
    report=json.loads(cli('report','--run-id','test-cycle-01'))
    assert report['criteria']==151 and report['routes']==12 and report['groups']==18 and report['passed']==2
    print('REPORT',json.dumps(report,ensure_ascii=False))
    print('CHECK',cli('check','--run-id','test-cycle-01'))
    print('SELFTEST_PASS; no real business tests executed')
