'use strict';
async function recoveryAllowed(db){const [[r]]=await db.execute("SELECT schema_value FROM platform_schema_metadata WHERE schema_key='recovery_status'");return !r||r.schema_value==='RELEASED';}
module.exports={recoveryAllowed};
