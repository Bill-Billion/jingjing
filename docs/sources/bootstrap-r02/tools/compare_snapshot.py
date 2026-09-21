#!/usr/bin/env python3
"""Read-only comparison against selected file hashes from the uploaded ZIP.
No Git commands, network access, configuration loading or application execution.
"""
from pathlib import Path
import argparse
import hashlib
import json
import sys

def main() -> int:
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo',required=True,type=Path,help='Verified repository root')
    args=ap.parse_args()
    root=args.repo.resolve()
    if not root.is_dir():
        print('Repository directory does not exist',file=sys.stderr); return 1
    base=Path(__file__).resolve().parents[1]
    snap=json.loads((base/'data/repo_snapshot_fingerprints.json').read_text(encoding='utf-8'))
    results={'snapshot_zip_sha256':snap['zip_sha256'],'snapshot_commit':None,
             'scope':'Only registered safe source-file hashes; newly added paths are not inventoried',
             'unchanged_count':0,'changed':[],'missing':[],'unreadable':[]}
    for row in snap['entries']:
        p=(root/row['path']).resolve()
        if not p.is_relative_to(root):
            results['unreadable'].append({'path':row['path'],'reason':'outside verified root'}); continue
        if not p.is_file(): results['missing'].append(row['path']); continue
        try: current=hashlib.sha256(p.read_bytes()).hexdigest()
        except OSError as exc:
            results['unreadable'].append({'path':row['path'],'reason':type(exc).__name__}); continue
        if current==row['sha256']:results['unchanged_count']+=1
        else:results['changed'].append({'path':row['path'],'snapshot_sha256':row['sha256'],'current_sha256':current})
    print(json.dumps(results,ensure_ascii=False,indent=2))
    return 0

if __name__=='__main__':
    try: raise SystemExit(main())
    except (OSError,ValueError,KeyError) as exc:
        print('ERROR:',str(exc),file=sys.stderr); raise SystemExit(1)
