'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const assertReport = require('./support/pr20-cash-report.cjs');
const ids = { web: 'unique-web', app: 'unique-app', hosting: 'unique-hosting' };
function fixture() {
  const rows = [
    [ids.web, 'RECEIPT', 4000], [ids.app, 'RECEIPT', 4000],
    [ids.hosting, 'RECEIPT', 2900], [ids.web, 'RECEIPT', 6000],
    [ids.app, 'RECEIPT', 6000], [ids.web, 'REFUND', 100],
  ].map(([record_id, category, amount_minor], i) =>
    ({ record_id, category, amount_minor, domain: 'TRADE', currency: 'CNY', source_id: `row-${i}` }));
  const sources = Object.values(ids).map(record_id => ({ record_id, domain: 'TRADE' }));
  return { row_count: rows.length, rows, sources, totals: { RECEIPT: 22900, REFUND: 100 } };
}
test('checks exact production receipts, distinct hosting, and original refund', () => assertReport(fixture(), ids));
test('equal totals do not mask misassigned, duplicated or relabeled cash rows', () => {
  for (const mutate of [
    r => { r.rows[2].record_id = ids.app; },
    r => { r.rows[5].record_id = ids.hosting; },
    r => { r.rows[2].source_id = r.rows[0].source_id; },
    r => { r.rows[5].category = 'RECEIPT'; },
    r => { r.sources.pop(); },
  ]) {
    const changed = fixture();
    mutate(changed);
    assert.throws(() => assertReport(changed, ids), assert.AssertionError);
  }
});
