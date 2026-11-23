'use strict';
// Extend the retained PM03 environment with existing multi-business synthetic records.
const path=require('node:path'),fs=require('node:fs/promises'),{randomUUID:key}=require('node:crypto');
const backend=path.resolve(__dirname,'../../晶晶日上工程交接包/01_源码/backend_server');
const load=rel=>require(path.join(backend,rel));
async function seed(db,out,deadline,check,storageAt){
 const samples=path.join(out,'samples');await fs.mkdir(samples,{recursive:true});
 const ffmpeg=process.env.JX_TEST_FFMPEG||process.env.FFMPEG_PATH||'ffmpeg';
 const run=args=>require('node:child_process').execFileSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error',...args],{windowsHide:true,stdio:'pipe',timeout:30000});
 for(const [file,source]of [['sample-1-full.mp4','testsrc2'],['sample-1-preview.mp4','smptebars'],['sample-3-full.mp4','smptebars']])run(['-f','lavfi','-i',source+'=size=320x180:rate=15','-t','2','-an','-c:v','libx264','-pix_fmt','yuv420p',path.join(samples,file)]);
 // The existing seed filename is retained, but this image is colour bars, not a portrait.
 run(['-f','lavfi','-i','smptebars=size=320x180','-frames:v','1','-update','1',path.join(samples,'test-portrait.jpg')]);
 const f=await require('../v5-r05-r12-seed.cjs').prepare(db,check,{firstSupply:true,samples,currentCommercial:true,currentStock:true});
 const app=load('src/http/account-api').createAccountApi({db,secret:f.secret,supplyStorageFactory:f.storageFactory,supplyEnv:{MARKETPLACE_CONTRACT_POLICY:'CONTRACT_20261029'},tradeEnv:{CUSTOMIZATION_MERCHANT_PARTY_ID:f.merchantId,MARKETPLACE_CONTRACT_POLICY:'CONTRACT_20261029'}});
 const server=app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 try{await f.setup('http://127.0.0.1:'+server.address().port+'/api/v1');}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 check();
 // The old notice and commercial orders remain explicitly legacy samples.
 const N=f.notices;
 let rule=await N.notices.createRule(N.outsider.ctx,{rule:{...N.ruleInput,version:'PM03-BATCH-20261118',publishing_policy:'VERIFIED_ADULT_20261111'},operation_key:key()});
 rule=await N.notices.review(N.reviewer.ctx,{record_id:rule.id,expected_version:rule.object_version,decision:'APPROVE',reason:'synthetic independent current rule',checks:{business_rule_verified:true},operation_key:key()});
 let notice=await N.notices.createNotice(N.buyer.ctx,{party_id:N.buyer.personal_party_id,rule_id:rule.id,notice:{...N.body,title:'PM03 整批合成普通通告'},operation_key:key()});
 notice=await N.notices.review(N.reviewer.ctx,{record_id:notice.id,expected_version:notice.object_version,decision:'APPROVE',reason:'synthetic independent',checks:{content_reviewed:true,materials_reviewed:true,no_private_contact:true},operation_key:key()});
 f.scenarios.ordinary_notice={notice_id:notice.id,rule_id:rule.id};
 const submissionKey=key(),submission={...N.submission,notice_id:notice.id};
 const sent=await N.notices.submit(N.seller.ctx,{party_id:N.seller.personal_party_id,rule_id:rule.id,submission,operation_key:submissionKey});
 f.scenarios.notice_receipt={operation:'SUBMIT',operation_key:submissionKey,submission_id:sent.id};
 // A guardian chooses the child through a reviewed link, never a child bearer token.
 const S=f.stock,W=load('src/modules/wallet/repository').createWalletRepository(db,{resolvePrincipal:S.resolvePrincipal});
 const wr=await load('src/modules/wallet/context').load(db,f.scenarios.wallet.rule_id,'RULE');
 await W.open(S.buyer2.ctx,{party_id:S.buyer2.personal_party_id,rule_id:wr.id,rule_sha256:wr.content_sha256,operation_key:key()});
 const ledger=load('src/modules/wallet/custody').createCustodyLedger(db);
 const binding={provider:'synthetic-custodian',environment:'SANDBOX',merchant_id:'synthetic-guardian',revision:'pm03'};
 const recharge=await db.withTransaction(tx=>ledger.prepare(tx,{id:S.buyer2.account_id},{party_id:S.buyer2.personal_party_id,amount_minor:30000,operation_key:key()},binding));
 await ledger.applyVerifiedReceipt({record_id:recharge.id,...binding,currency:'CNY',amount_minor:30000,transaction_id:'synthetic:'+recharge.id,occurred_at:await load('src/modules/artists/context').now(db),status:'SUCCEEDED'});
 await db.execute("UPDATE artist_people SET age_band='MINOR' WHERE id=?",[S.buyer2.person.id]);
 const proof=await S.supply.upload(S.seller.ctx,{party_id:S.seller.personal_party_id,purpose:'REVIEW_EVIDENCE',media_type:'text/plain',body:Buffer.from('synthetic guardian only'),operation_key:key()});
 const rid=key(),content=load('src/modules/governance/content').createRuleContent({id:rid,rule_key:'guardian.protection',version:'synthetic-pm03',terms:{guardian_protection:{version:'CONTRACT_20261029',daily_minutes:30,rest_minutes:15,single_minor:1000,daily_minor:2000,night_start:22,night_end:8,terms:'synthetic guardian only'}}});
 await db.execute("INSERT INTO governance_rules(id,rule_key,version_label,content_json,effective_at,created_by,current_status) VALUES (?,?,?,?,?,?,'EFFECTIVE')",[rid,'guardian.protection',content.version,JSON.stringify(content),'2020-01-01 00:00:00',S.reviewer.account_id]);
 const grant=load('src/modules/governance/operator-access').maintainOperatorGrant;
 const [existing]=await db.execute('SELECT object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[S.reviewer.account_id,'PRIVACY_REVIEW']);
 await grant(db,{account_id:S.reviewer.account_id,action:'PRIVACY_REVIEW',enabled:true,expected_version:existing[0]?.object_version||0,expires_at:deadline,authority_ref:'synthetic:pm03-batch',reason:'synthetic independent guardian review'});
 const G=load('src/modules/guardians/repository').createGuardianRepository(db,{resolvePrincipal:S.resolvePrincipal});
 let link=await G.invite(S.seller.ctx,{child_account_id:S.buyer2.account_id,relationship:'synthetic parent',evidence_asset_ids:[proof.id],rule_id:rid,valid_until:deadline,operation_key:key()});
 link=await G.decide(S.buyer2.ctx,{record_id:link.id,expected_version:link.object_version,decision:'ACCEPT',reason:'synthetic child acceptance',operation_key:key()});
 link=await G.decide(S.reviewer.ctx,{record_id:link.id,operations:true,expected_version:link.object_version,decision:'APPROVE',age_band:'AGE_14_17',identity_checked:true,relationship_checked:true,reason:'synthetic relationship review',operation_key:key()});
 f.scenarios.guardian_refund={guardian_role:'stock_seller',child_role:'stock_buyer2',guardian_link_id:link.id,child_party_id:S.buyer2.personal_party_id,recharge_id:recharge.id,evidence_asset_id:proof.id};
 await grant(db,{account_id:f.people.reviewer.account_id,action:'WALLET_REFUND_REVIEW',enabled:true,expected_version:0,expires_at:deadline,authority_ref:'synthetic:pm03-batch',reason:'independent synthetic recharge refund review and scheduling'});
 const accounts={},byAccount=new Map(),auth=load('src/modules/auth/repository').createAuthRepository(db,{secret:f.secret});
 for(const [role,u]of Object.entries(f.people)){
  if(!byAccount.has(u.account_id)){
   const phone='1991000'+String(byAccount.size).padStart(4,'0');
   const [rows]=await db.execute('SELECT action_code,object_version FROM governance_operator_grants WHERE account_id=? AND enabled=TRUE',[u.account_id]);
   for(const r of rows)await grant(db,{account_id:u.account_id,action:r.action_code,enabled:true,expected_version:r.object_version,expires_at:deadline,authority_ref:'synthetic:pm03-batch',reason:'expire synthetic operator authority with environment'});
   await db.execute('INSERT INTO auth_subjects(phone_hash,account_id) VALUES (?,?)',[auth.secure.digest('phone',phone),u.account_id]);
   await db.execute('UPDATE auth_sessions SET revoked=TRUE WHERE account_id=?',[u.account_id]);
   byAccount.set(u.account_id,{account_id:u.account_id,phone,operator_actions:rows.map(r=>r.action_code)});
  }
  accounts[role]={...byAccount.get(u.account_id),party_id:u.acting_party_id||u.personal_party_id};
 }
 const storage=storageAt(out)();for(const [k,body]of f.allFiles())await storage.put({key:k,body});
 check();
 const {party_id:stockParty,...stockListing}=S.listingInput;
 return {secret:f.secret,merchant_party_id:S.seller.personal_party_id,customization_merchant_party_id:f.merchantId,accounts,scenarios:f.scenarios,
  requests:{stock_listing:stockListing,notice_submission:{rule_id:rule.id,submission},guardian_refund:{child_party_id:S.buyer2.personal_party_id,guardian_link_id:link.id,recharge_id:recharge.id,amount_minor:1000,reason:'synthetic refund',evidence_asset_ids:[proof.id]}},
  coverage:{current_additions:['ordinary_notice','notice_receipt','guardian_refund'],legacy_samples:['notice'],media_limit:'Synthetic colour bars and playable MP4 cover stock, audition and cocreation. No real-person material.',payment_limit:'New interactive trade payments use the order merchant. Seeded paid records retain their historical synthetic provider bindings; no claim they have been exercised through current payment UI.',frontend_tested:false}};
}
module.exports={seed};
