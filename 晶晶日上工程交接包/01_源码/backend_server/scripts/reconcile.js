// scripts/reconcile.js - 手动对账 CLI：node scripts/reconcile.js          只看结果不落表
//                                          node scripts/reconcile.js --save   落 reconciliation_runs 并按配置告警
const db = require('../db');
const recon = require('../services/reconciliation');

(async () => {
  if (process.argv.includes('--save')) {
    const r = await recon.runAndReport(db, { scope: 'manual' });
    console.log(JSON.stringify({ balanced: r.balanced, summary: r.summary, diffs: r.diffs }, null, 2));
    process.exit(r.balanced ? 0 : 1);
  }
  const r = recon.runReconciliation(db);
  console.log(JSON.stringify({ balanced: r.balanced, summary: r.summary, diffs: r.diffs, orderCount: r.perOrder.length }, null, 2));
  process.exit(r.balanced ? 0 : 1);
})();
