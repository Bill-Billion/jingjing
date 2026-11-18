const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const mysql=require(path.resolve(process.cwd(),'晶晶日上工程交接包/01_源码/backend_server/node_modules/mysql2/promise'));
(async()=>{const e=JSON.parse(fs.readFileSync(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));assert.equal(e.NODE_ENV,'test');assert.equal(e.MYSQL_HOST,'127.0.0.1');assert.equal(e.MYSQL_PORT,'33316');assert.equal(e.MYSQL_DATABASE,'jx_dev');
const c=await mysql.createConnection({host:e.MYSQL_HOST,port:Number(e.MYSQL_PORT),user:e.MYSQL_USER,password:e.MYSQL_PASSWORD,database:e.MYSQL_DATABASE});
const samples=[];let ahead=0,maxAhead=-Infinity,minAhead=Infinity;
try{for(let n=0;n<2000;n++){const [[r]]=await c.execute('SELECT ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) ms');const node=Date.now(),db=Number(r.ms),delta=db-node;maxAhead=Math.max(maxAhead,delta);minAhead=Math.min(minAhead,delta);if(delta>0){ahead++;if(samples.length<8)samples.push({db_ms:db,node_ms:node,delta_ms:delta});}}}finally{await c.end();}
const result={isolated_read_only:true,sample_count:2000,database_ahead_of_node_count:ahead,min_delta_ms:minAhead,max_delta_ms:maxAhead,samples,limitation:'Clock mechanism probe only; failed full-run original proof values were not captured.'};fs.writeFileSync(path.resolve('docs/reviews/pm01-notice-revisions-20261113/CLOCK_PROBE.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
