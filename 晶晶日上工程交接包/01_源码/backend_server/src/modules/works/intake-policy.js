"use strict";
const {error}=require('../party/policy'),{authorizeOperator}=require('../governance/operator-access');
// This restricts new submissions; it never deletes existing works, orders or licenses.
async function requireIntake(tx,accountId,enabled){if(enabled&&!await authorizeOperator(tx,{account_id:accountId,action:'SUPPLY_SCRIPT_INTAKE'}))throw error('SCRIPT_SELF_SERVICE_NOT_AVAILABLE',403);}
module.exports={requireIntake};
