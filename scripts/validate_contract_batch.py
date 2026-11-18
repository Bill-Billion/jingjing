"""Validate every declared synthetic HTTP file, sharing one contract validation.

Missing/malformed input is a failure, never a skipped item. Per-file reports keep
common protocol checks as well as their own response checks. No server calls.
"""
import argparse
import json
from pathlib import Path
import sys
import time
from unittest.mock import patch
from validate_contract import ROOT, validate


def load_manifest(path, root=ROOT):
    root = root.resolve()
    data = json.loads(path.read_text(encoding='utf-8'))
    if type(data.get('version')) is not int or data['version'] != 1 or not isinstance(data.get('entries'), list) or not data['entries']:
        raise ValueError('A nonempty version 1 runtime manifest is required')
    entries, seen_inputs, seen_outputs = [], set(), set()
    for entry in data['entries']:
        if not isinstance(entry, dict) or set(entry) != {'fixtures', 'report'}:
            raise ValueError('Each entry must specify exactly fixtures and report')
        resolved = {}
        for field, prefix in [('fixtures', '.local/'), ('report', '.local/ci-evidence/')]:
            value = entry[field]
            if not isinstance(value, str) or not value.startswith(prefix) or '\\' in value or '..' in Path(value).parts or not value.endswith('.json'):
                raise ValueError('Invalid runtime ' + field + ' path')
            target = (root/value).resolve()
            if not target.is_relative_to((root/prefix).resolve()):
                raise ValueError('Runtime path escapes its permitted directory')
            resolved[field] = target
        if resolved['fixtures'] in seen_inputs or resolved['report'] in seen_outputs:
            raise ValueError('Duplicate runtime input or output')
        seen_inputs.add(resolved['fixtures']); seen_outputs.add(resolved['report'])
        entries.append(resolved)
    if seen_inputs & seen_outputs:
        raise ValueError('A report must not overwrite a fixture')
    return entries


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def run(manifest, root=ROOT):
    entries = load_manifest(manifest, root)
    # Replace stale PASS reports before any validation can fail or be interrupted.
    for entry in entries:
        write_report(entry['report'], {'result':'FAIL','error':'Batch validation has not completed','runtime_tests':'NOT_RUN'})
    started = time.perf_counter()
    try:
        with patch('socket.socket.connect',side_effect=RuntimeError('Network forbidden during contract validation')):
            combined = validate([entry['fixtures'] for entry in entries])
        groups = combined['runtime_files']
        if len(groups) != len(entries):
            raise ValueError('Runtime report membership mismatch')
        for entry, group in zip(entries, groups):
            if Path(group['fixtures']) != entry['fixtures']:
                raise ValueError('Runtime report input mismatch')
            result = {key:value for key,value in combined.items() if key not in {'runtime_files','common_checks','common_failures'}}
            result.update(runtime_response_cases=group['runtime_response_cases'], checks=combined['common_checks']+group['checks'],
                          failures=combined['common_failures']+group['failures'])
            result['result'] = 'FAIL' if result['failures'] else 'PASS'
            result['runtime_fixture_sha256'] = group['sha256']
            write_report(entry['report'], result)
        # Store portable paths; file hashes still identify the exact input bytes.
        for group, entry in zip(groups,entries):
            group['fixtures'] = entry['fixtures'].relative_to(root.resolve()).as_posix()
            group['report'] = entry['report'].relative_to(root.resolve()).as_posix()
    except Exception as exc:
        combined = {'result':'FAIL','error':str(exc),'runtime_tests':'NOT_RUN'}
        for entry in entries:
            write_report(entry['report'], combined)
    combined['runtime_file_count'] = len(entries)
    combined['elapsed_seconds'] = round(time.perf_counter()-started,3)
    return combined


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',required=True,type=Path)
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    try:
        entries=load_manifest(args.manifest)
        if args.report and args.report.resolve() in {p for entry in entries for p in entry.values()}:
            raise ValueError('Summary must not overwrite an input or individual report')
        if args.report:
            write_report(args.report,{'result':'FAIL','error':'Batch validation has not completed','runtime_tests':'NOT_RUN'})
        report=run(args.manifest)
    except Exception as exc:
        report={'result':'FAIL','error':str(exc),'runtime_tests':'NOT_RUN'}
    if args.report:
        # Never write a rejected summary path over a fixture/per-file report.
        if 'entries' not in locals() or args.report.resolve() not in {p for entry in entries for p in entry.values()}:
            write_report(args.report,report)
    print(json.dumps(report,ensure_ascii=False,indent=2))
    sys.exit(0 if report['result']=='PASS' else 1)
