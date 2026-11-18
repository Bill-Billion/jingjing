"""Source-to-system inventory, never an automatic business acceptance verdict.

Keeps old statements, latest effective criteria and unresolved source paragraphs
separate. Run from any directory; --check fails on changed/stale inventory.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'docs/requirements/SOURCE_TO_SYSTEM_20261106.json'


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))


def build():
    base = 'docs/baselines/v5-d1/data/'
    acceptance = read('docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json')
    original = {x['id']: x for x in read(base + 'acceptance.json')}
    features = read(base + 'full_scope.json')
    old = read(base + 'legacy_req_crosswalk.json')
    prototype = read(base + 'prototype40_crosswalk.json')
    packages = {x['id']: x for x in read('docs/reviews/prelaunch-20261105/AUDIT.json')['packages']}
    failures, rows, exact_refs = [], [], {}
    for item in acceptance['items']:
        original_item = original.get(item['id'])
        if original_item is None or item['source_expected'] != original_item['expected']:
            failures.append('Original source missing or changed: ' + item['id'])
        if not item.get('task_refs'):
            failures.append('No existing task mapping: ' + item['id'])
        for ref in item.get('effective_source_evidence', []):
            lines = (ROOT / ref['source']).read_text(encoding='utf-8').splitlines()
            if lines[ref['line'] - 1] != ref['quote']:
                failures.append('Source quotation changed: ' + item['id'])
            exact_refs.setdefault((ref['source'], ref['line']), []).append(item['id'])
        paths = sorted({p for package in item['packages'] for p in packages[package]['implementation_locations']})
        for location in paths:
            if not (ROOT / location).exists():
                failures.append('Implementation entry missing: ' + location)
        rows.append({
            'id': item['id'], 'title': item['work'], 'source': item['source'],
            'original_text': item['source_expected'],
            'effective_expected': item.get('effective_expected', item['source_expected']),
            'decision_refs': item.get('decision_refs', []),
            'exact_latest_source_quotes': item.get('effective_source_evidence', []),
            'packages': item['packages'], 'task_refs': item['task_refs'],
            'implementation_entries': paths,
            'mapping_depth': 'ENTRY_LOCATED_NOT_BEHAVIOR_VERIFIED',
            'latest_source_review': 'EXACT_QUOTES_RECORDED' if item.get('effective_source_evidence') else 'CLAUSE_BY_CLAUSE_RECONCILIATION_PENDING',
            'formal_status': item['status'],
        })
    for group in [old, prototype]:
        for row in group:
            if row['id'] == 'REQ-027' and row.get('handling') == '继续排除' and not row.get('packages'):
                source = 'docs/baselines/v5-d1/sources/02_REQUIREMENTS_RECONCILED.md'
                quote = (ROOT / source).read_text(encoding='utf-8').splitlines()[2]
                if 'REQ-027明确排除并保留历史' not in quote:
                    failures.append('Role auction exclusion evidence changed')
                row['exclusion_evidence'] = {'source': source, 'line': 3, 'quote': quote}
                continue
            if not row.get('packages') or any(x not in packages for x in row['packages']):
                failures.append('Legacy/prototype mapping invalid: ' + row['id'])
    feature_rows = []
    for f in features:
        ids = [i for i, a in original.items() if a.get('feature') == f['id']]
        if not ids:
            failures.append('Source feature lacks acceptance: ' + f['id'])
        feature_rows.append({'id': f['id'], 'title': f['title'], 'source': f['source'],
                             'source_scope': f['scope'], 'acceptance_ids': ids,
                             'package': f['package']})
    by_id = {row['id']: row for row in rows}
    supplemental = []
    for item in acceptance['supplemental_items']:
        source_ids = [x for x in item['source_acceptance_ids'] if x in by_id]
        if not source_ids:
            failures.append('Supplement has no original acceptance mapping: ' + item['id'])
        supplemental.append({
            'id': item['id'], 'effective_expected': item['effective_expected'],
            'source_acceptance_ids': source_ids,
            'route_refs': [x for x in item['source_acceptance_ids'] if x.startswith('E2E-')],
            'task_refs': item['task_refs'], 'decision_refs': item['decision_refs'],
            'implementation_entries': sorted({p for source in source_ids for p in by_id[source]['implementation_entries']}),
            'mapping_depth': 'ENTRY_LOCATED_NOT_BEHAVIOR_VERIFIED',
            'formal_status': item['status'],
        })
    documents = []
    for path in sorted((ROOT / 'docs/sources/contracts-20261029/extracted').glob('*.md')):
        relative = path.relative_to(ROOT).as_posix()
        lines = path.read_text(encoding='utf-8').splitlines()
        # Word extraction contains headings and table cells too: these are
        # source passages, deliberately not counted as atomic requirements.
        passages = [{'line': n, 'text': line, 'exact_linked_acceptance_ids': exact_refs.get((relative, n), []),
                     'review': 'QUOTED_CRITERION_NOT_CLOSED' if (relative, n) in exact_refs else 'NOT_RECONCILED'}
                    for n, line in enumerate(lines, 1) if n > 3 and line.strip()]
        documents.append({'path': relative, 'original_document': lines[0].removeprefix('# '),
                          'sha256_utf8_lf': hashlib.sha256(path.read_text(encoding='utf-8').encode('utf-8')).hexdigest(), 'passages': passages})
    return {'date': '2026-11-06', 'result': 'PASS' if not failures else 'FAIL',
            'meaning': 'Reference integrity only; not a statement that all requirements are implemented, reconciled or accepted.',
            'precedence': ['Latest explicit user business decision', 'Latest applicable original material; same-version specific clause takes priority', 'Earlier sources and provisional choices only where not superseded'],
            'historical_orders': 'Keep agreed version; do not rewrite prior contracts or payments.',
            'counts': {'legacy_ids': len(old), 'prototype_topics': len(prototype), 'source_features': len(features),
                       'source_acceptance': len(rows), 'supplemental_acceptance': len(acceptance['supplemental_items']),
                       'latest_contract_documents': len(documents), 'source_passages_not_atomic_requirements': sum(len(x['passages']) for x in documents)},
            'failures': failures, 'source_features': feature_rows, 'acceptance': rows,
            'supplemental_acceptance': supplemental,
            'legacy_crosswalk': old, 'prototype_crosswalk': prototype, 'latest_sources': documents}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = build()
    if args.check:
        if not TARGET.exists() or json.loads(TARGET.read_text(encoding='utf-8')) != result:
            raise SystemExit('Requirement inventory is stale. Regenerate and review the differences.')
    else:
        TARGET.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({k: result[k] for k in ['result', 'meaning', 'counts', 'failures']}, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['result'] == 'PASS' else 1)
