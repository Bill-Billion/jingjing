#!/usr/bin/env python3
"""Safely install PM04 QA18 plan/tools into a CLEAN, non-release repository worktree.
Does not commit, push, create PR, change board/official acceptance, run tests, or deploy.
"""
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent
FILES = [
    'scripts/qa18_registry.py',
    'scripts/test_qa18_registry.py',
    'docs/pm04/qa18/01_统一机测总计划.md',
    'docs/pm04/qa18/02_后端Codex立即开工.md',
    'docs/pm04/qa18/03_18组与12链矩阵.md',
    'docs/pm04/qa18/04_登记与协作规范.md',
    'docs/pm04/qa18/05_前端Codex分工交接.md',
    'docs/pm04/qa18/06_日报与阶段收口模板.md',
    'docs/pm04/qa18/TASKS_18_12.json',
]


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python apply_qa18.py /path/to/jingjing-worktree')
    root = Path(sys.argv[1]).resolve()
    if not (root/'AGENTS.md').is_file() or not (root/'docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json').is_file():
        raise SystemExit('Not the jingjing repository root; stop')
    if git(root, 'status', '--porcelain'):
        raise SystemExit('Refusing dirty worktree. Preserve uncommitted changes in a safe way first.')
    branch = git(root, 'branch', '--show-current')
    if not branch or branch in ('main', 'integration'):
        raise SystemExit('Use a dedicated QA branch, never main/integration or a detached HEAD')
    for name in FILES:
        src = PACKAGE/name
        if not src.is_file():
            raise SystemExit('Package missing: '+name)
        dst = root/name
        if dst.exists() and dst.read_bytes() != src.read_bytes():
            raise SystemExit('Target already differs, refusing overwrite: '+name)
    for name in FILES:
        src, dst = PACKAGE/name, root/name
        dst.parent.mkdir(parents=True,exist_ok=True)
        if not dst.exists():
            shutil.copy2(src,dst)
    print('PLAN_INSTALLED_ON_LOCAL_BRANCH',branch)
    print('FILES',len(FILES))
    print('No product tests run, no formal acceptance changed, no remote write; next run QA18 init and actual G01 tests.')


if __name__ == '__main__':
    main()
