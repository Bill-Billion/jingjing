'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const mysql=require('mysql2/promise');
const {openDatabase}=require('../src/infrastructure/database');
const {migrate,status,lockName}=require('../src/infrastructure/database/migrator');
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));

test('Real isolated MySQL8 foundation', {skip:!process.env.JX_MYSQL_TEST_ENV_FILE}, async(t)=>{
  const env=JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE,'utf8'));
  assert.equal(env.NODE_ENV,'test');assert.equal(env.DB_CLIENT,'mysql');
  assert.equal(env.MYSQL_HOST,'127.0.0.1');assert.equal(env.MYSQL_PORT,'33316');
  assert.equal(env.MYSQL_USER,'jx_local');assert.equal(env.MYSQL_DATABASE,'jx_dev');
  const control=await mysql.createConnection({host:env.MYSQL_HOST,port:Number(env.MYSQL_PORT),user:env.MYSQL_USER,password:env.MYSQL_PASSWORD,database:env.MYSQL_DATABASE});
  const [[server]]=await control.query('SELECT VERSION() AS version, @@port AS port');
  assert.match(server.version,/^8\./);assert.equal(server.port,33316);
  t.diagnostic(`Real MySQL ${server.version} on loopback:${server.port}; generated jx_test_* databases only`);
  const created=new Set(), pools=[];
  const root=path.resolve(__dirname,'../../../..');
  const fixtureRoot=path.join(root,'.local/mysql-test-fixtures',crypto.randomBytes(6).toString('hex'));
  await fs.mkdir(fixtureRoot,{recursive:true});
  async function newDatabase() {
    const name=`jx_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
    assert.match(name,/^jx_test_\d+_[a-f0-9]{12}$/);
    await control.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);created.add(name);
    const db=await openDatabase({...env,MYSQL_DATABASE:name});pools.push(db);return db;
  }
  async function fixture(name,entries) {
    const dir=path.join(fixtureRoot,name);await fs.mkdir(dir);
    for(const [file,sql] of Object.entries(entries))await fs.writeFile(path.join(dir,file),sql);
    return dir;
  }
  try {
    const db=await newDatabase();
    await t.test('status on a fresh database is read-only',async()=>{
      const state=await status(db);assert.deepEqual(state.migrations.map(x=>x.status),['PENDING','PENDING','PENDING','PENDING','PENDING']);assert.equal(state.history.length,0);
      const [[row]]=await db.execute('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE()');assert.equal(Number(row.n),0);
    });
    await t.test('new schema applies once, repeated migration is a no-op',async()=>{
      assert.deepEqual((await migrate(db)).applied,['0001','0002','0003','0004','0005']);assert.deepEqual((await migrate(db)).applied,[]);
      const state=await status(db);assert.equal(state.history.length,5);assert.ok(state.history.every(x=>x.status==='APPLIED'));
      const [[marker]]=await db.execute('SELECT schema_value FROM platform_schema_metadata WHERE schema_key=?',['storage_generation']);assert.equal(marker.schema_value,'r06_async_mysql8_v1');
      const [engines]=await db.execute('SELECT ENGINE FROM information_schema.tables WHERE table_schema=DATABASE()');assert.ok(engines.every(x=>x.ENGINE==='InnoDB'));
    });
    await t.test('parameters, UTC, utf8mb4 and BIGINT are preserved',async()=>{
      await db.withConnection(c=>c.query('CREATE TABLE samples (id INT PRIMARY KEY, value BIGINT NOT NULL, label VARCHAR(120)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'));
      const label="剧本🎬 '); DROP TABLE samples; --";
      await db.execute('INSERT INTO samples VALUES (?,?,?)',[1,'9007199254740993',label]);
      const [[row]]=await db.execute('SELECT value,label,@@session.time_zone AS zone FROM samples WHERE id=?',[1]);
      assert.equal(row.value,'9007199254740993');assert.equal(row.label,label);assert.equal(row.zone,'+00:00');
    });
    await t.test('business transaction commits, rolls back and refuses implicit-commit SQL',async()=>{
      await assert.rejects(db.withTransaction(async tx=>{await tx.execute('INSERT INTO samples VALUES (?,?,?)',[2,100,'rollback']);throw new Error('controlled failure');}),/controlled failure/);
      const [[count]]=await db.execute('SELECT COUNT(*) AS n FROM samples WHERE id=2');assert.equal(Number(count.n),0);
      let scope;
      await db.withTransaction(async tx=>{scope=tx;await tx.execute('INSERT INTO samples VALUES (?,?,?)',[2,100,'committed']);});
      assert.throws(()=>scope.execute('SELECT 1'),/scope has ended/);
      await assert.rejects(db.withTransaction(tx=>tx.execute('CREATE TABLE forbidden (id INT)')),{code:'TRANSACTION_SQL_NOT_ALLOWED'});
      const [[row]]=await db.execute('SELECT value FROM samples WHERE id=2');assert.equal(row.value,'100');
    });
    await t.test('concurrent business updates keep both increments',async()=>{
      await Promise.all([1,2].map(()=>db.withTransaction(tx=>tx.execute('UPDATE samples SET value=value+1 WHERE id=?',[2]))));
      const [[row]]=await db.execute('SELECT value FROM samples WHERE id=2');assert.equal(row.value,'102');
    });
    await t.test('a second migration session cannot acquire the same database lock',async()=>{
      await db.withConnection(async c=>{
        await c.execute('SELECT GET_LOCK(?,0)',[lockName(db.database)]);
        try {await assert.rejects(migrate(db),{code:'MIGRATION_LOCK_BUSY'});}finally{await c.execute('SELECT RELEASE_LOCK(?)',[lockName(db.database)]);}
      });
      assert.deepEqual((await migrate(db)).applied,[]);
    });
    await t.test('historical checksum/name drift and inserted older migration are rejected',async()=>{
      const source=path.resolve(__dirname,'../migrations/mysql-runtime');
      const entries={};for(const f of await fs.readdir(source))if(f.endsWith('.sql'))entries[f]=await fs.readFile(path.join(source,f),'utf8');
      const dir=await fixture('drift',entries);
      await fs.appendFile(path.join(dir,'0001_schema_metadata.sql'),'\n-- changed');
      await assert.rejects(status(db,{directory:dir}),{code:'MIGRATION_DRIFT'});
      await fs.writeFile(path.join(dir,'0001_schema_metadata.sql'),entries['0001_schema_metadata.sql']);
      await fs.writeFile(path.join(dir,'0000_backfill.sql'),'SELECT 1');
      await assert.rejects(migrate(db,{directory:dir}),{code:'MIGRATION_ORDER_INVALID'});
    });
    await t.test('DDL failure keeps earlier commits, blocks silent replay and supports inspected retry',async()=>{
      const failing=await newDatabase();
      const directory=await fixture('ddl-failure',{'0001_survivor.sql':'CREATE TABLE survivor (id INT PRIMARY KEY) ENGINE=InnoDB',
        '0002_add_column.sql':'ALTER TABLE prerequisite ADD COLUMN label VARCHAR(20)'});
      await assert.rejects(migrate(failing,{directory}),{code:'MIGRATION_SQL_FAILED'});
      await failing.execute('INSERT INTO survivor VALUES (?)',[1]); // Earlier DDL really exists after failure.
      let state=await status(failing,{directory});assert.deepEqual(state.history.map(x=>x.status),['APPLIED','FAILED']);
      await assert.rejects(migrate(failing,{directory}),{code:'MIGRATION_FAILED'});
      await assert.rejects(migrate(failing,{directory,retryVersion:'0002',expectedChecksum:'0'.repeat(64),reason:'wrong checksum'}),{code:'MIGRATION_RETRY_INVALID'});
      await failing.withConnection(c=>c.query('CREATE TABLE prerequisite (id INT PRIMARY KEY) ENGINE=InnoDB'));
      const checksum=state.migrations.find(x=>x.version==='0002').checksum;
      assert.deepEqual((await migrate(failing,{directory,retryVersion:'0002',expectedChecksum:checksum,reason:'test: missing prerequisite inspected and repaired'})).applied,['0002']);
      state=await status(failing,{directory});assert.deepEqual(state.history.map(x=>x.status),['APPLIED','FAILED','APPLIED']);
      assert.equal(state.history[2].attempt,2);assert.match(state.history[2].reason,/inspected/);assert.deepEqual((await migrate(failing,{directory})).applied,[]);
    });
    await t.test('connection loss preserves APPLYING and refuses unsafe automatic retry',async()=>{
      const interrupted=await newDatabase();
      const directory=await fixture('interrupted',{'0001_wait.sql':'DO SLEEP(10)'});
      const pending=migrate(interrupted,{directory});
      const rejected=assert.rejects(pending,{code:'MIGRATION_OUTCOME_UNKNOWN'});
      let killed=false;
      for(let n=0;n<50;n++) {
        await sleep(50);
        const state=await status(interrupted,{directory});
        if(state.history[0]?.status==='APPLYING') {
          const [[owner]]=await control.execute('SELECT IS_USED_LOCK(?) AS id',[lockName(interrupted.database)]);
          assert.ok(Number.isSafeInteger(Number(owner.id)) && Number(owner.id)>0);
          await control.query(`KILL CONNECTION ${Number(owner.id)}`);killed=true;break;
        }
      }
      assert.equal(killed,true);await rejected;
      const state=await status(interrupted,{directory});assert.equal(state.history[0].status,'APPLYING');
      await assert.rejects(migrate(interrupted,{directory}),{code:'MIGRATION_OUTCOME_UNKNOWN'});
    });
    await t.test('wrong credentials fail without connecting to SQLite',async()=>{
      await assert.rejects(openDatabase({...env,MYSQL_PASSWORD:'wrong-synthetic-password'}),{code:'ER_ACCESS_DENIED_ERROR'});
    });
  } finally {
    for(const db of pools)await db.close();
    for(const name of created) {assert.match(name,/^jx_test_\d+_[a-f0-9]{12}$/);await control.query(`DROP DATABASE \`${name}\``);}
    await control.end();
  }
});
