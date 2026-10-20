'use strict';
async function recoveryAllowed(db){const [[r]]=await db.execute("SELECT schema_value FROM platform_schema_metadata WHERE schema_key='recovery_status'");if(!r)return true;if(r.schema_value!=='RELEASED')return false;const [[p]]=await db.execute("SELECT schema_value FROM platform_schema_metadata WHERE schema_key='privacy_erasure_status'");return p?.schema_value==='REPLAYED';}
module.exports={recoveryAllowed};
