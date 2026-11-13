'use strict';
// Some historic opt-ins are directory paths, not boolean switches: "0" is still enabled.
function backendOnlyEnvironment(input){
 const env={...input,JX_PM01_NOTICES_WEB:'0',JX_PM01_STOCK_WEB:'0'};
 for(const key of ['JX_INDEPENDENT_WEB','JX_INDEPENDENT_FULL_UI','JX_INDEPENDENT_EVIDENCE_DIR'])delete env[key];
 return env;
}
module.exports={backendOnlyEnvironment};
