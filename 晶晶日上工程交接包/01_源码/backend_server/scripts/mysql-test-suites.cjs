'use strict';
// Shared by the focused runner and full CI, so a new suite cannot silently be omitted.
module.exports=Object.freeze({
 governance:['test/governance-content.test.cjs','test/governance.integration.test.cjs'],
 mysql:['test/mysql-config.test.cjs','test/mysql.integration.test.cjs'],
 worker:['test/worker.integration.test.cjs','test/worker.test.cjs'],
 providers:['test/provider-foundation.test.cjs','test/provider-readiness.integration.test.cjs','test/storage.test.cjs'],
 party:['test/party.integration.test.cjs'],
});
