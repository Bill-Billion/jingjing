 'use strict';
const {openDatabase}=require('../src/infrastructure/database');
const {createAuthRepository}=require('../src/modules/auth/repository');
(async()=>{
 if(process.env.DB_CLIENT!=='mysql')throw Error('EXPLICIT_MYSQL_ENV_REQUIRED');
 const db=await openDatabase(process.env);
 try{await createAuthRepository(db,{secret:process.env.AUTH_SECRET_BASE64}).cleanup();console.log('Expired authentication secrets cleaned.');}finally{await db.close();}
})().catch(()=>{console.error('Authentication cleanup failed; inspect configuration and database state.');process.exitCode=1;});
