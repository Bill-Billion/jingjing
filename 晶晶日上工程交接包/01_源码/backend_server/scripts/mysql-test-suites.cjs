'use strict';
// Shared by the focused runner and full CI, so a new suite cannot silently be omitted.
module.exports=Object.freeze({
 mysql:['test/mysql-config.test.cjs','test/mysql.integration.test.cjs'],
 worker:['test/worker.integration.test.cjs','test/worker.test.cjs'],
 providers:['test/provider-foundation.test.cjs','test/provider-readiness.integration.test.cjs','test/storage.test.cjs'],
 party:['test/party.integration.test.cjs'],
 'account-api':['test/account-api.integration.test.cjs','test/auth-security.test.cjs'],
});
