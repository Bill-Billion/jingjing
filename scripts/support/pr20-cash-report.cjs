'use strict';

// Only the Stage20 synthetic fixture owns these six expected facts.
const assert = require('node:assert/strict');
module.exports = function assertStage20CashReport(result, { web, app, hosting }) {
  const orderIds = [web, app, hosting];
  assert.equal(new Set(orderIds).size, 3, 'Production and hosting are separate orders');
  const compact = (order, category, amount) => `${order}:${category}:${amount}`;
  const expected = [
    compact(web, 'RECEIPT', 4000),
    compact(web, 'RECEIPT', 6000),
    compact(app, 'RECEIPT', 4000),
    compact(app, 'RECEIPT', 6000),
    compact(hosting, 'RECEIPT', 2900),
    compact(web, 'REFUND', 100),
  ].sort();
  assert.equal(result.row_count, expected.length);
  assert.deepEqual(result.rows.map(row => {
    assert.equal(row.domain, 'TRADE');
    assert.equal(row.currency, 'CNY');
    return compact(row.record_id, row.category, row.amount_minor);
  }).sort(), expected);
  assert.equal(new Set(result.rows.map(row => row.source_id)).size, expected.length);
  assert.deepEqual(result.sources.map(row => {
    assert.equal(row.domain, 'TRADE');
    return row.record_id;
  }).sort(), [...orderIds].sort());
  assert.deepEqual(result.totals, { RECEIPT: 22900, REFUND: 100 });
};
