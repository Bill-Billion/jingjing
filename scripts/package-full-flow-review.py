"""Build a local review bundle from explicit committed evidence and working review docs.
Never packages runtime configs, a database, provider material, dependencies or APKs.
"""
from pathlib import Path
import argparse, hashlib, html, json, re, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])
def sha(data):
    return hashlib.sha256(data).hexdigest()
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    workspace = ROOT.parents[1]
    if not output.is_relative_to(workspace / 'deliverables') or output.exists():
        raise SystemExit('Use a NEW directory beneath workspace/deliverables; no overwrite.')
    source = git('rev-parse', 'd721725').decode().strip()
    baseline = git('rev-parse', 'cf98af3').decode().strip()
    changed = [p for p in git('diff', '--name-only', '-z', baseline, source).decode().split('\0') if p]
    code = [p for p in changed if p.startswith(('contracts/', 'scripts/', '晶晶日上工程交接包/01_源码/'))]
    files = {}
    for name in git('ls-tree', '-r', '--name-only', source).decode('utf-8').splitlines():
        # git may quote unicode paths; evidence/document paths below are ASCII.
        if name.startswith('docs/testing/evidence/20261005/') and Path(name).suffix in {'.json', '.png'}:
            files[name] = git('show', source + ':' + name)
        elif name.startswith('docs/tasks/records/CORE-full-flow') and name.endswith('.md'):
            files[name] = git('show', source + ':' + name)
    for name in ['docs/testing/BUGS_20261005.md', 'docs/testing/FULL_FLOW_ACCEPTANCE.md',
                 'docs/collaboration/RELATION_DISPLAY_NAMES.md', 'docs/collaboration/FULL_FLOW_REPAIR_HANDOFF.md']:
        files[name] = (ROOT / name).read_bytes()
    for p in sorted((ROOT / 'docs/reviews/20261005').glob('*')):
        if p.is_file() and p.suffix in {'.md', '.json'} and p.name != 'PACKAGE_VERIFICATION.json':
            files[p.relative_to(ROOT).as_posix()] = p.read_bytes()
    files['CODE_CHANGES.patch'] = git('diff', '--binary', '--no-ext-diff', baseline, source, '--', *code)
    files['COMMITS.txt'] = git('log', '--reverse', '--format=%h %s', baseline + '..' + source)
    manifest = {'code_commit': source, 'repair_baseline': baseline,
                'not_a_full_checkout': True, 'not_an_apk': True,
                'patch_scope': '39 changed source/test/tool/contract files; apply only against declared baseline after review',
                'changed_files_all': changed, 'changed_code_files': code,
                'source_file_hashes': {p: sha(git('show', source + ':' + p)) for p in code},
                'exclusions': ['api folder', '.local', '.env', 'database', 'provider credentials', 'node_modules', 'build outputs', 'APK', '.git history']}
    manifest['patch_scope'] = f'{len(code)} changed source/test/tool/contract files; viewing patch, not a full source checkout'
    files['MANIFEST.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    links = [('先读：这批改了什么', '00_READ_FIRST.md'), ('队友检查清单', '01_REVIEW_CHECKLIST.md'),
             ('三组业务怎样复测', '02_RETEST_GUIDE.md'), ('测试证据索引', '03_EVIDENCE_INDEX.md'),
             ('安卓包还差什么', '04_ANDROID_READINESS.md'), ('27项测试失败与下一步', '05_OPEN_CHECK_FAILURES.md')]
    link_html = ''.join('<li><a href="docs/reviews/20261005/' + file + '">' + title + '</a></li>' for title, file in links)
    content = """<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>晶晶日上 · 五批修复集中审阅</title>
<style>body{max-width:960px;margin:40px auto;padding:0 24px;font:17px/1.8 system-ui;color:#24332c;background:#fafaf7}h1{font-size:29px}a{color:#28634c}section{background:white;padding:20px 28px;margin:20px 0;border:1px solid #ddd;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}small{color:#555}</style>
<h1>五批修复集中审阅</h1><p>名称显示、身份切换、私有文件读取和保存提示已修复并有测试证据。此包供审阅，<b>不是安卓安装包，也不是完整源码仓库</b>。</p>
<section><h2>先看这些</h2><ul>""" + link_html + """</ul><p>技术补充：<a href="CODE_CHANGES.patch">代码差异</a> · <a href="COMMITS.txt">五批提交</a> · <a href="MANIFEST.json">版本与改动清单</a></p></section>
<section><h2>当前说明</h2><pre>""" + html.escape(files['docs/reviews/20261005/00_READ_FIRST.md'].decode('utf-8')) + """</pre></section>
<section><h2>当前仍需处理</h2><p>App当前业务范围249项通过；全部测试目录另有27项失败。网页176项通过，服务器各组通过并有1项旧库比较跳过。本包不是全部验收通过的证明。</p></section><p>原始Markdown材料保留仓库相对链接；若链接目标未随包附带，请到完整仓库读取。解压后再打开本页。没有真实验证码、服务配置或控制令牌。</p></html>"""
    files['打开审阅说明.html'] = content.encode('utf-8')
    for name, data in files.items():
        if Path(name).suffix not in {'.png'}:
            text = data.decode('utf-8')
            if re.search(r'AKLT[A-Za-z0-9]{20,}|15637821757|-----BEGIN (?:RSA )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/]{30}', text):
                raise SystemExit('Sensitive pattern detected in ' + name)
        if Path(name).is_absolute() or '..' in Path(name).parts:
            raise SystemExit('Unsafe archive member')
    checksum = {name: sha(data) for name, data in files.items()}
    files['SHA256.json'] = (json.dumps(checksum, ensure_ascii=False, indent=2) + '\n').encode()
    output.mkdir(parents=True)
    for name, data in files.items():
        p = output / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    archive = output.with_suffix('.zip')
    if archive.exists():
        raise SystemExit('Archive already exists; not overwritten')
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None and len(z.namelist()) == len(files)
        for name, digest in checksum.items():
            assert sha(z.read(name)) == digest
    print(json.dumps({'folder': str(output), 'zip': str(archive), 'files': len(files),
                      'code_files': len(code), 'zip_sha256': sha(archive.read_bytes()), 'bytes': archive.stat().st_size,
                      'verified': True}, ensure_ascii=False, indent=2))
if __name__ == '__main__':
    main()
