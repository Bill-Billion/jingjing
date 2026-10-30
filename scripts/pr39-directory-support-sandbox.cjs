'use strict';
// Loopback-only synthetic acceptance fixture. No provider credentials or production data.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { randomUUID: key, randomBytes, createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, '晶晶日上工程交接包/01_源码/backend_server');
require(path.join(backend, 'scripts/test-network-guard.cjs'));
const mysql = require(path.join(backend, 'node_modules/mysql2/promise'));
const { openDatabase } = require(path.join(backend, 'src/infrastructure/database'));
const { migrate } = require(path.join(backend, 'src/infrastructure/database/migrator'));
const ffmpeg = '/opt/homebrew/bin/ffmpeg', ffprobe = '/opt/homebrew/bin/ffprobe';
const sha = body => createHash('sha256').update(body).digest('hex');

async function main() {
  if (process.argv.length !== 2 || !process.env.JX_MYSQL_TEST_ENV_FILE) throw Error('Use JX_MYSQL_TEST_ENV_FILE with this local fixture');
  const env = JSON.parse(await fs.readFile(process.env.JX_MYSQL_TEST_ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries({ NODE_ENV:'test', DB_CLIENT:'mysql', MYSQL_HOST:'127.0.0.1', MYSQL_PORT:'33316', MYSQL_USER:'jx_local', MYSQL_DATABASE:'jx_dev' })) {
    if (env[k] !== v) throw Error('Refusing non-isolated database configuration');
  }
  const suffix = process.pid + '_' + randomBytes(6).toString('hex');
  const name = 'jx_test_directory_ui_' + suffix;
  const out = path.join(root, '.local/pr39-directory-support-' + suffix);
  await fs.mkdir(out, { recursive:false, mode:0o700 });
  let control, created = false, db, server, starting = true, stopping = false, cleanupPromise, watcher, timer, commandBusy = false;
  const requests = [], damaged = new Map();
  let delayMs = 0, delayScope = 'discovery';
  const write = (name, value) => fs.writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
  const cleanup = () => cleanupPromise ??= (async () => {
    clearInterval(watcher); clearTimeout(timer); process.stdin.pause();
    const failures = [];
    const step = async (label, f) => { try { await f(); return true; } catch { failures.push(label); return false; } };
    const credentials_removed = await step('credentials', () => fs.unlink(path.join(out, 'access.json')).catch(e => { if (e.code !== 'ENOENT') throw e; }));
    if (server) await step('http', async () => { server.closeAllConnections(); await new Promise((ok, no) => server.close(e => e && e.code !== 'ERR_SERVER_NOT_RUNNING' ? no(e) : ok())); });
    if (db) await step('pool', () => db.close());
    const database_removed = !created || /^jx_test_directory_ui_[0-9]+_[a-f0-9]{12}$/.test(name) && await step('database', () => control.query('DROP DATABASE ' + mysql.escapeId(name)));
    if (control) await step('control', () => control.end());
    await write('requests.json', { synthetic_only:true, requests });
    const result = { status:failures.length ? 'CLEANUP_FAILED' : 'STOPPED', synthetic_only:true, database_removed, credentials_removed, failed_steps:failures };
    await write('status.json', result); if (failures.length) process.exitCode = 1;
    console.log(JSON.stringify(result)); return result;
  })();
  const stop = () => { stopping = true; if (!starting) void cleanup(); };
  const alive = () => { if (stopping) throw Object.assign(Error('Stopped'), { code:'LOCAL_STOP_REQUESTED' }); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  process.stdin.setEncoding('utf8'); process.stdin.on('data', data => { if (data.trim() === 'quit') stop(); }); process.stdin.unref?.();
  try {
    control = await mysql.createConnection({ host:env.MYSQL_HOST, port:Number(env.MYSQL_PORT), user:env.MYSQL_USER, password:env.MYSQL_PASSWORD, database:env.MYSQL_DATABASE });
    await control.query('CREATE DATABASE ' + mysql.escapeId(name) + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin'); created = true;
    db = await openDatabase({ ...env, MYSQL_DATABASE:name }); await migrate(db); alive();
    const S = await require(path.join(backend, 'test/helpers/directory-seed.cjs')).seedDirectory(db);
    const T = await require(path.join(backend, 'test/helpers/stock-seed.cjs')).seedStock(db);
    const U = await require(path.join(backend, 'test/helpers/auditions-seed.cjs')).seedAuditions(db);
    const grant = require(path.join(backend, 'src/modules/governance/operator-access')).maintainOperatorGrant;
    for (const [user, actions] of [[S.reviewer, ['SUPPLY_REVIEW_PROFILE']], [S.outsider, ['ARTIST_REVIEW_CONTENT', 'SUPPORT_HANDLE']]]) {
      for (const action of actions) await grant(db, { account_id:user.account_id, action, enabled:true, expected_version:0, expires_at:null, authority_ref:'synthetic:directory-support-ui', reason:'Isolated acceptance fixture only' });
    }
    // Distinct seed accounts share one HTTP auth secret in this combined fixture.
    const auth = require(path.join(backend, 'src/modules/auth/repository')).createAuthRepository(db, { secret:S.secret });
    for (const user of [...T.users, ...U.users]) await db.execute('INSERT INTO auth_sessions(token_hash,account_id,expires_ms) VALUES (?,?,ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+14400000)', [auth.secure.digest('token', user.token), user.account_id]);
    await db.execute('UPDATE auth_sessions SET expires_ms=ROUND(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000)+14400000');
    const maps = [S.bytes, T.bytes, U.bytes];
    const storageFactory = () => ({
      put:async input => { S.bytes.set(input.key, input.body); return { key:input.key, sha256:sha(input.body), size:input.body.length }; },
      getBuffer:async k => { for (const map of maps) if (map.has(k)) return map.get(k); return undefined; },
    });
    const run = require(path.join(backend, 'src/modules/media/marking')).run;
    await run(ffmpeg, ['-nostdin','-v','error','-f','lavfi','-i','color=c=0xB94732:s=240x320','-frames:v','1','-threads','1','-y','synthetic-portrait.png'], { cwd:out });
    await run(ffmpeg, ['-nostdin','-v','error','-f','lavfi','-i','color=c=0x294F68:s=480x270','-frames:v','1','-threads','1','-y','organization-cover.png'], { cwd:out });
    const portraitBytes = await fs.readFile(path.join(out,'synthetic-portrait.png'));
    const coverBytes = await fs.readFile(path.join(out,'organization-cover.png'));
    const artistAssets = require(path.join(backend, 'src/modules/works/assets')).createSupplyAssets({ db, repository:require(path.join(backend, 'src/modules/artists/assets')).createArtistAssetsRepository(db, { resolvePrincipal:S.resolvePrincipal }), storageFactory });
    const artistScope = { person_id:S.seller.person.id, party_id:S.seller.personal_party_id };
    const portrait = await artistAssets.upload(S.seller.ctx, { ...artistScope, purpose:'AVATAR_MATERIAL', media_type:'image/png', body:portraitBytes, operation_key:key() });
    const look = await S.artists.createVariant(S.seller.ctx, { ...artistScope, avatar_id:S.avatar.id, kind:'LOOK', variant:{ previous_version_id:S.publicListing.data.look_version_id, display_name:'合成肖像色块', material_asset_ids:[portrait.id], consent_id:S.publicConsent.id }, operation_key:key() });
    let publicArtist = await S.artists.submitListing(S.seller.ctx, { ...artistScope, avatar_id:S.avatar.id, listing:{ display_name:'合成艺人·林夏', city:'北京市', introduction:'用于目录、搜索、收藏和权限变化联调的合成艺人，图片为合成色块。', tags:['合成','城市故事'], consent_id:S.publicConsent.id, look_version_id:look.id, voice_version_id:null, audition_public:false, preview_asset_ids:[portrait.id], primary_portrait_asset_id:portrait.id }, operation_key:key() });
    publicArtist = await S.artists.review(S.reviewer.ctx, { person_id:S.seller.person.id, record_id:publicArtist.id, expected_version:publicArtist.object_version, decision:'APPROVE', reason:'Independent synthetic public listing review', operation_key:key() });
    const org = await S.parties.createOrganization(S.buyer.ctx, { display_name:'合成映像机构', operation_key:key() });
    await S.parties.requestCapability(S.buyer.ctx, { party_id:org.party_id, code:'PRODUCER', operation_key:key() });
    await db.execute("UPDATE party_capabilities SET current_status='ACTIVE' WHERE party_id=? AND code='PRODUCER'", [org.party_id]);
    const upload = (user, party, bytes, type = 'text/plain', purpose = 'REVIEW_EVIDENCE') => S.supply.upload(user.ctx, { party_id:party, purpose, media_type:type, body:bytes, operation_key:key() });
    const cover = await upload(S.buyer, org.party_id, coverBytes, 'image/png', 'WORK_CONTENT');
    const proof = await upload(S.buyer, org.party_id, Buffer.from('Synthetic organization review evidence. Not a real business credential.'));
    const directory = require(path.join(backend, 'src/modules/directory/repository')).createDirectoryRepository(db, { resolvePrincipal:S.resolvePrincipal });
    const profile = { display_name:'合成映像机构', introduction:'合成影片制作机构，供公开资料、通告分页和撤回联调。', city:'北京市', capabilities:['PRODUCER'], cover_asset_id:cover.id, evidence_asset_ids:[proof.id], valid_from:'2020-01-01T00:00:00.000Z', valid_until:'2099-01-01T00:00:00.000Z' };
    let organization = await directory.submitOrganization(S.buyer.ctx, { party_id:org.party_id, profile, operation_key:key() });
    const reviewDirectory = r => directory.review(S.reviewer.ctx, { record_id:r.id, expected_version:r.object_version, decision:'APPROVE', reason:'Independent synthetic directory review', checks:r.kind === 'ORGANIZATION' ? { identity_verified:true, capabilities_verified:true, materials_reviewed:true, public_display_authorized:true, no_private_contact:true } : { public_source_verified:true, recommendation_reviewed:true, not_star_certification:true }, operation_key:key() });
    organization = await reviewDirectory(organization);
    let feature = await directory.proposeFeature(S.outsider.ctx, { feature:{ listing_id:publicArtist.id, recommendation:'运营推荐：合成城市故事联调资料', sort_order:1, valid_from:profile.valid_from, valid_until:profile.valid_until }, operation_key:key() });
    feature = await reviewDirectory(feature);
    // Organizations publish through their separately reviewed notice qualification.
    let orgQualification = await S.notices.applyQualification(S.buyer.ctx, { party_id:org.party_id, types:['RECRUITMENT'], valid_from:profile.valid_from, valid_until:profile.valid_until, evidence_asset_ids:[proof.id], terms:'Synthetic organization recruitment permission only.', operation_key:key() });
    orgQualification = await S.notices.review(S.reviewer.ctx, { record_id:orgQualification.id, expected_version:orgQualification.object_version, decision:'APPROVE', reason:'Independent synthetic organization qualification review', checks:{ identity_verified:true, authority_verified:true, evidence_verified:true }, operation_key:key() });
    const notices = [];
    for (let n = 1; n <= 23; n++) {
      let notice = await S.notices.createNotice(S.buyer.ctx, { party_id:org.party_id, rule_id:S.rule.id, notice:{ ...S.body, title:'城市故事·合成通告 '+String(n).padStart(2,'0'), description:'合成机构发布的分页与搜索验收通告。仅用于隔离测试，不招募真实人员。', city:'北京市' }, operation_key:key() });
      notice = await S.notices.review(S.reviewer.ctx, { record_id:notice.id, expected_version:notice.object_version, decision:'APPROVE', reason:'Independent synthetic notice review', checks:{ content_reviewed:true, materials_reviewed:true, no_private_contact:true }, operation_key:key() });
      notices.push(notice);
    }
    const films = {};
    for (const [label, color, duration] of [['full','red',2], ['preview','blue',1]]) {
      await run(ffmpeg, ['-nostdin','-v','error','-f','lavfi','-i',`color=c=${color}:s=320x180:d=${duration}`,'-c:v','libx264','-threads','1','-y',label+'.mp4'], { cwd:out });
      films[label] = await T.supply.upload(T.seller.ctx, { party_id:T.seller.personal_party_id, purpose:'WORK_CONTENT', media_type:'video/mp4', body:await fs.readFile(path.join(out,label+'.mp4')), operation_key:key() });
    }
    let stock = await T.stock.create(T.seller.ctx, { ...T.listingInput, file_id:films.full.id, preview_file_id:films.preview.id, description:'合成城市故事影片：完整片红色2秒，预览蓝色1秒。', city:'北京市', operation_key:key() });
    stock = await T.reviewListing(stock, 'RIGHTS'); stock = await T.reviewListing(stock, 'CONTENT');
    let audition = await U.auditions.createOffer(U.seller.ctx, { party_id:U.seller.personal_party_id, offer:{ ...U.offer, title:'城市故事·合成试镜', city:'北京市', service_area:'合成片场', public_price:false }, operation_key:key() });
    audition = await U.auditions.reviewOffer(U.reviewer.ctx, { record_id:audition.id, expected_version:audition.object_version, decision:'APPROVE', reason:'Synthetic offline audition offer', operation_key:key() });
    const files = {};
    for (const [name, contents] of [['feedback-initial.txt','合成问题说明：目录内容无法继续办理。'], ['feedback-proof.txt','合成补充证据：相同身份刷新后仍可复现。'], ['feedback-supplement.txt','合成补件说明：已按要求补充操作时间和步骤。']]) {
      const bytes = Buffer.from(contents); await fs.writeFile(path.join(out,name),bytes); files[name] = await upload(S.buyer,S.buyer.personal_party_id,bytes);
    }
    const support = require(path.join(backend, 'src/modules/support/repository')).createSupportRepository(db, { resolvePrincipal:S.resolvePrincipal });
    async function createTicket(party, title, withAssets = false) {
      return support.create(S.buyer.ctx, { party_id:party, kind:'FEEDBACK', title, target:null, text:'隔离模拟问题，请按正常客服流程处理。', asset_ids:withAssets ? [files['feedback-initial.txt'].id,files['feedback-proof.txt'].id] : [], operation_key:key() });
    }
    async function staffAction(ticket, action, text = '合成客服处理说明') {
      return support.act(S.outsider.ctx, { ticket_id:ticket.id, party_id:null, operations:true, action, text, asset_ids:[], expected_version:ticket.object_version, operation_key:key() });
    }
    let ticket = await createTicket(S.buyer.personal_party_id,'合成个人反馈：目录显示问题',true);
    ticket = await staffAction(ticket,'START','正在核对你反馈的目录显示问题。');
    let orgTicket = await createTicket(org.party_id,'合成机构反馈：机构资料问题');
    orgTicket = await staffAction(orgTicket,'START','正在核对机构资料，个人身份的提醒不受本条影响。');
    const app = require(path.join(backend, 'src/http/account-api')).createAccountApi({ db, secret:S.secret, supplyStorageFactory:storageFactory, supplyEnv:{ MEDIA_FFMPEG:ffmpeg, MEDIA_FFPROBE:ffprobe }, allowedOrigins:['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:5500','http://localhost:5500'] });
    server = http.createServer((req,res) => {
      res.on('finish', () => { if (req.url.startsWith('/api/')) { requests.push({ at:new Date().toISOString(), method:req.method, path:req.url, status:res.statusCode }); if (requests.length > 1500) requests.shift(); } });
      const delayed = delayMs && (delayScope === 'discovery' ? /\/(discovery|directory)\//.test(req.url) : /\/support\//.test(req.url));
      if (delayed) setTimeout(() => { if (!stopping && !res.destroyed) app(req,res); },delayMs); else app(req,res);
    });
    server.listen(0,'127.0.0.1'); await new Promise((ok,no) => { server.once('listening',ok); server.once('error',no); }); alive();
    const base_url = 'http://127.0.0.1:' + server.address().port + '/api/v1';
    const account = (user, party = user.personal_party_id) => ({ account_id:user.account_id, party_id:party, personal_party_id:user.personal_party_id, bearer_token:user.token });
    const accounts = { viewer:account(S.buyer), buyer:account(S.buyer), owner:account(S.buyer,org.party_id), other:account(S.buyer2), reviewer:account(S.reviewer), support:account(S.outsider), artist:account(S.seller), stock_owner:account(T.seller), audition_owner:account(U.seller) };
    const scenarios = { directory:{ organization_party_id:org.party_id, organization_record_id:organization.id, feature_record_id:feature.id, cover_asset_id:cover.id, evidence_asset_id:proof.id, notice_ids:notices.map(n=>n.id) }, artist:{ listing_id:publicArtist.id, person_id:S.seller.person.id, consent_id:S.publicConsent.id, portrait_asset_id:portrait.id }, stock:{ listing_id:stock.id }, audition:{ offer_id:audition.id }, support:{ personal_ticket_id:ticket.id, organization_ticket_id:orgTicket.id, asset_ids:Object.fromEntries(Object.entries(files).map(([name,file])=>[name,file.id])) } };
    await fs.writeFile(path.join(out,'access.json'), JSON.stringify({ synthetic_only:true, base_url, accounts, scenarios },null,2)+'\n', { mode:0o600 });
    await write('fixture.json', { synthetic_only:true, scenarios, upload_files:['organization-cover.png','feedback-initial.txt','feedback-proof.txt','feedback-supplement.txt'], notes:['All people, permissions, money receipts and business descriptions are synthetic.','The ordinary viewer and organization owner are the same login account with different acting parties.','The support operator is independent of both owner identities.','The public audition price is intentionally hidden; null must not render as free.'] });
    await write('status.json', { status:'RUNNING', synthetic_only:true, database:name, base_url, created_at:new Date().toISOString(), expires_in_minutes:240 });
    async function get(url, actor = accounts.viewer, acting = false) {
      const response = await fetch(base_url+url,{headers:{Authorization:'Bearer '+actor.bearer_token,...(acting?{'X-Acting-Party':actor.party_id}:{})}});
      const data = await response.json(); if (!response.ok) throw Error('Fixture HTTP check failed: '+url+' '+response.status+' '+(data.error?.code||'')); return data.data;
    }
    const checks = [];
    for (const url of ['/discovery/cities','/directory/organizations','/directory/featured-artists','/discovery/search?kind=ARTIST&q='+encodeURIComponent('林夏'),'/discovery/search?kind=STOCK&q='+encodeURIComponent('城市故事'),'/discovery/search?kind=AUDITION&q='+encodeURIComponent('城市故事'),'/discovery/search?kind=NOTICE&q='+encodeURIComponent('城市故事')+'&limit=20','/me/collections/preferences']) {
      const data = await get(url); checks.push({ url, ok:true, item_count:data.items?.length, next_cursor_present:!!data.next_cursor, history_enabled:data.history_enabled });
    }
    checks.push({ url:'/operations/notifications/unread', ok:true, total:(await get('/operations/notifications/unread',accounts.viewer,true)).total });
    await write('verified.json',{synthetic_only:true,checks});
    async function command(input) {
      if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.id)) throw Error('Invalid command ID');
      switch(input.action) {
        case 'inspect': break;
        case 'support-action': {
          const ticketId = input.ticket_id || ticket.id;
          if (!/^[a-f0-9-]{36}$/.test(ticketId) || !['START','REQUEST_INFO','ANSWER','CLOSE'].includes(input.operation)) throw Error('Invalid support action');
          const current = await support.read(S.outsider.ctx,{ticket_id:ticketId,party_id:null,operations:true});
          const result = await staffAction(current,input.operation,input.text||'合成客服处理说明');
          return { ticket:result };
        }
        case 'new-notification': {
          let next = await createTicket(input.identity === 'organization' ? org.party_id : S.buyer.personal_party_id,'合成新提醒 '+new Date().toISOString());
          next = await staffAction(next,'START','这条消息产生在此前未读快照之后。'); return { ticket:next };
        }
        case 'expire-snapshots': await db.execute("UPDATE ops_read_snapshots SET expires_at='2020-01-01' WHERE account_id=?",[S.buyer.account_id]); break;
        case 'set-support-permission': {
          if (typeof input.enabled !== 'boolean') throw Error('Boolean enabled required');
          const [[g]] = await db.execute("SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code='SUPPORT_HANDLE'",[S.outsider.account_id]);
          await grant(db,{account_id:S.outsider.account_id,action:'SUPPORT_HANDLE',enabled:input.enabled,expected_version:g.object_version,expires_at:null,authority_ref:'synthetic:directory-support-ui',reason:'Synthetic permission-change acceptance'}); break;
        }
        case 'damage-asset': {
          if (!/^[a-f0-9-]{36}$/.test(input.asset_id||'')) throw Error('Asset id required');
          const [[file]] = await db.execute('SELECT object_key FROM supply_assets WHERE id=?',[input.asset_id]); if (!file) throw Error('Unknown fixture asset');
          const map = maps.find(m=>m.has(file.object_key)); if (!map) throw Error('Asset bytes absent');
          if (!damaged.has(file.object_key)) damaged.set(file.object_key,{map,body:map.get(file.object_key)});
          map.set(file.object_key,Buffer.from('deliberately damaged synthetic bytes')); break;
        }
        case 'restore-assets': for (const [k,v] of damaged) v.map.set(k,v.body); damaged.clear(); break;
        case 'close-notice': {
          const selected = notices.find(n=>n.id===input.notice_id)||notices[0];
          await S.notices.close(S.buyer.ctx,{party_id:org.party_id,record_id:selected.id,expected_version:selected.object_version,reason:'Synthetic visibility change',operation_key:key()}); break;
        }
        case 'withdraw-organization': organization = await directory.withdraw(S.buyer.ctx,{record_id:organization.id,party_id:org.party_id,expected_version:organization.object_version,reason:'Synthetic directory withdrawal',operation_key:key()}); break;
        case 'withdraw-artist': await S.artists.withdraw(S.seller.ctx,{...artistScope,record_id:S.publicConsent.id,expected_version:S.publicConsent.object_version,reason:'Synthetic public permission withdrawal',operation_key:key()}); break;
        case 'unlist-stock': stock = await T.stock.status(T.seller.ctx,{party_id:T.seller.personal_party_id,record_id:stock.id,expected_version:stock.object_version,action:'UNLIST',reason:'Synthetic visibility change',operation_key:key()}); break;
        case 'close-audition': audition = await U.auditions.offerStatus(U.seller.ctx,{record_id:audition.id,party_id:U.seller.personal_party_id,expected_version:audition.object_version,public_booking:false,public_price:false,operation_key:key()}); break;
        case 'delay': if (!Number.isInteger(input.ms)||input.ms<0||input.ms>10000||!['discovery','support'].includes(input.scope)) throw Error('Invalid bounded delay'); delayMs=input.ms; delayScope=input.scope; break;
        default: throw Error('Unknown fixture action');
      }
      const tickets = (await db.execute('SELECT id,party_id,title,current_status,object_version FROM support_tickets WHERE created_by=? ORDER BY created_at DESC LIMIT 30',[S.buyer.account_id]))[0];
      await write('requests.json',{synthetic_only:true,requests}); return { scenarios, tickets, delay_ms:delayMs, delay_scope:delayScope };
    }
    async function watch() {
      if (commandBusy || stopping) return;
      try { await fs.access(path.join(out,'stop')); stop(); return; } catch (e) { if (e.code!=='ENOENT') {stop();return;} }
      commandBusy=true;
      try {
        const file=path.join(out,'command.json'); let input;
        try { input=JSON.parse(await fs.readFile(file,'utf8')); } catch(e) { if(e.code==='ENOENT')return;throw e; }
        await fs.unlink(file); let result;
        try { result={id:input.id,ok:true,result:await command(input)}; } catch(e) { result={id:input.id,ok:false,error:e.code||e.message}; }
        await write('command-result.json',result);
      } catch(e) { console.error('ISOLATED_COMMAND_FAILED',e.code||e.message); } finally {commandBusy=false;}
    }
    starting=false; watcher=setInterval(watch,200); timer=setTimeout(stop,240*60*1000);
    console.log(JSON.stringify({status:'READY',synthetic_only:true,base_url,folder:out,access_file:path.join(out,'access.json'),fixture_file:path.join(out,'fixture.json'),stop_file:path.join(out,'stop'),ttl_minutes:240}));
  } catch(e) {
    starting=false; await cleanup(); if(e.code!=='LOCAL_STOP_REQUESTED')throw e;
  }
}
main().catch(e=>{console.error(e.code||e.message||'DIRECTORY_SUPPORT_SANDBOX_FAILED');process.exitCode=1;});
