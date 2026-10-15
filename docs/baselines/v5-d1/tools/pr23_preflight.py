#!/usr/bin/env python3
"""PR23只读核对器：不ready、不merge、不push，不输出配置与凭证。
远端只调用GET；本地仅git fetch更新远端跟踪信息，不checkout/reset。
"""
from __future__ import annotations
import argparse,json,subprocess,sys
from pathlib import Path
from urllib.parse import urlparse
REPO='Bill-Billion/jingjing'
HEAD='25e6d29f81fd882edc203b732a48fe90d15f8c9f'
BASE='28662ab39950ad6a2f0b3c4ca372df9a65195b96'
MAIN='eba5daedf71016b5c05661498a89fba57a4b21ed'
PARENTS={'21':'419fa392363d8b66969c396836d72477d6f2692b','22':'6536457e63f6910199657a95ed6517c6a770af88'}

def origin_matches(url: str) -> bool:
    x=url.strip()
    if x.startswith('git@github.com:'):
        path=x.split(':',1)[1]
    else:
        p=urlparse(x)
        if p.hostname!='github.com': return False
        path=p.path.lstrip('/')
    return path.removesuffix('.git').lower()==REPO.lower()

def run(args:list[str],cwd:Path,allowed=(0,)) -> subprocess.CompletedProcess:
    p=subprocess.run(args,cwd=cwd,text=True,encoding='utf-8',errors='replace',capture_output=True,timeout=120)
    if p.returncode not in allowed:
        # 不回显完整stderr，以防账号配置或远端URL包含敏感值。
        raise RuntimeError(f'{args[0]} 子命令失败，退出码 {p.returncode}；请本机检查权限/网络，不向公开日志粘贴凭证。')
    return p

def main() -> int:
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('--repo-dir',required=True,type=Path)
    a.add_argument('--output',required=True,type=Path)
    a.add_argument('--expected-head',default=HEAD)
    a.add_argument('--expected-base',default=BASE)
    opt=a.parse_args();cwd=opt.repo_dir.resolve()
    report={'repository':REPO,'pr':23,'mode':'READ_ONLY_PREFLIGHT','merge_executed':False,'main_modified':False,'blockers':[],'warnings':[]}
    try:
        for tool in ['git','gh']:run([tool,'--version'],cwd)
        url=run(['git','remote','get-url','origin'],cwd).stdout
        if not origin_matches(url):raise RuntimeError('origin不是预期GitHub仓库；已停止，不打印原地址。')
        dirty=run(['git','status','--porcelain'],cwd).stdout
        report['working_tree_dirty']=bool(dirty.strip())
        if dirty.strip(): report['warnings'].append('有未提交文件；本脚本不改它们，禁止后续reset/覆盖；新开发应另建干净worktree。')
        pr=json.loads(run(['gh','api',f'repos/{REPO}/pulls/23'],cwd).stdout)
        report.update(state=pr['state'],draft=pr['draft'],merged=pr.get('merged',False),head_sha=pr['head']['sha'],base_branch=pr['base']['ref'],base_sha=pr['base']['sha'],mergeable=pr.get('mergeable'))
        if report['merged']:
            report['blockers'].append('PR已合并，不重复执行；请记录真实merge提交并重新建立当前起点。')
        if pr['state']!='open':report['blockers'].append('PR不是OPEN。')
        if pr['head']['sha']!=opt.expected_head:report['blockers'].append('PR头已变化，须重新评估差异。')
        if pr['base']['ref']!='integration':report['blockers'].append('目标不是integration，禁止按本手册合并。')
        live_base=json.loads(run(['gh','api',f'repos/{REPO}/git/ref/heads/integration'],cwd).stdout)['object']['sha']
        live_main=json.loads(run(['gh','api',f'repos/{REPO}/git/ref/heads/main'],cwd).stdout)['object']['sha']
        report['live_integration_sha']=live_base;report['main_sha']=live_main
        if live_base!=opt.expected_base:report['blockers'].append('integration已前进，须重新核对合并差异/测试。')
        if live_main!=MAIN:report['warnings'].append('main与D1快照不同；不要回退，核对后保持当前main不变。')
        if pr.get('mergeable') is False:report['blockers'].append('GitHub报告合并冲突。')
        if pr.get('mergeable') is None:report['blockers'].append('GitHub尚未算出可合并性，稍后重查。')
        run(['git','fetch','origin','integration','main',pr['head']['ref']],cwd)
        report['ancestor_checks']={}
        for number,sha in PARENTS.items():
            p=run(['git','merge-base','--is-ancestor',sha,opt.expected_head],cwd,allowed=(0,1))
            report['ancestor_checks'][number]={'head':sha,'contained':p.returncode==0}
            if p.returncode:report['blockers'].append(f'PR{number}未被候选包含，停止，不自行cherry-pick。')
        p=run(['gh','pr','checks','23','--repo',REPO,'--json','name,state,bucket,workflow,link'],cwd,allowed=(0,1,8))
        checks=json.loads(p.stdout or '[]');report['checks']=checks
        if not checks:report['blockers'].append('没有检查记录，不能把空列表当通过。')
        bad=[x['name'] for x in checks if x.get('bucket')!='pass']
        if bad:report['blockers'].append('存在失败/等待/跳过检查：'+'、'.join(bad))
        last=json.loads(run(['gh','api',f'repos/{REPO}/pulls/23'],cwd).stdout)
        if last['head']['sha']!=opt.expected_head:report['blockers'].append('核对过程中PR头发生变化。')
        report['preflight_consistent']=not report['blockers']
        report['human_checks_remaining']=['确认本次仅归档已有工程成果，未把手机或V5验收标通过','实际代码/机密检查及重要共享边界审阅','仓库规则要求的批准；不允许admin绕过','手动ready后再次检查，不使用自动合并或删除分支']
    except (RuntimeError,subprocess.TimeoutExpired,FileNotFoundError,KeyError,json.JSONDecodeError) as e:
        report['preflight_consistent']=False;report['blockers'].append(str(e))
    opt.output.parent.mkdir(parents=True,exist_ok=True)
    opt.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('核对报告已保存：'+str(opt.output))
    print('只读核对一致；仍需人工门禁，不代表已批准/合并。' if report.get('preflight_consistent') else '核对未通过；请读报告，不执行合并。')
    return 0 if report.get('preflight_consistent') else 2
if __name__=='__main__':sys.exit(main())
