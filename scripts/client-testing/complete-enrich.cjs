'use strict';
// New examples belong only to a newly prepared, marked local database.
const assert=require('node:assert/strict'),path=require('node:path'),{randomUUID:key}=require('node:crypto');
const backend=path.resolve(__dirname,'../../晶晶日上工程交接包/01_源码/backend_server'),load=p=>require(path.join(backend,p));
async function enrich(db,m,dir){
 require('./persistent-story.cjs').validateManifest(m,m.database);
 const [[marker]]=await db.execute('SELECT id,synthetic_only FROM client_test_environment');
 assert(marker.id===m.environment_id&&marker.synthetic_only===1);
 const people={};for(const [role,u] of Object.entries(m.access.accounts)){const [[a]]=await db.execute('SELECT subject_ref FROM identity_accounts WHERE id=?',[u.account_id]);people[role]={...u,ctx:{subject_ref:a.subject_ref}};}
 const buyer=people.stock_buyer,handler=people.stock_reviewer,verifier=people.reviewer;
 assert(buyer.account_id!==handler.account_id&&handler.account_id!==verifier.account_id&&buyer.account_id!==verifier.account_id);
 for(const [u,action] of [[handler,'SUPPORT_HANDLE'],[handler,'INVOICE_HANDLE'],[verifier,'INVOICE_VERIFY']])await load('src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:0,expires_at:null,authority_ref:'synthetic:complete-fixtures',reason:'仅隔离模拟环境使用'});
 const resolvePrincipal=async ctx=>ctx,invoice=load('src/modules/invoices/repository').createInvoiceRepository(db,{resolvePrincipal,env:{NODE_ENV:'test',INVOICE_SANDBOX_ENABLED:'true'}}),support=load('src/modules/support/repository').createSupportRepository(db,{resolvePrincipal});
 const orderId=m.access.scenarios.stock_paid.order_id,header={kind:'PERSON',title:'模拟客户小林',tax_id:null};
 const basis=await invoice.eligibility(buyer.ctx,{party_id:buyer.party_id,order_id:orderId});assert(basis.available_minor>=5);
 const amount=Math.floor(basis.available_minor/5),invoices={},tickets={};
 const invoiceAct=(r,action,u=handler,extra={})=>invoice.act(u.ctx,{invoice_id:r.id,operations:true,action,text:'仅测试办理，不是真实发票',expected_version:r.object_version,operation_key:key(),...extra});
 for(const state of ['REQUESTED','NEEDS_INFO','ISSUED']){
  let r=await invoice.create(buyer.ctx,{party_id:buyer.party_id,order_id:orderId,amount_minor:amount,header,text:'模拟发票申请：'+state,asset_ids:[],operation_key:key()});
  if(state==='NEEDS_INFO')r=await invoiceAct(r,'REQUEST_INFO');
  if(state==='ISSUED'){r=await invoiceAct(r,'APPROVE');r=await invoiceAct(r,'RECORD_DOCUMENT',handler,{document:{amount_minor:amount,reference:'SYNTHETIC-'+key(),issued_at:new Date(Date.now()-1000).toISOString(),asset_id:null,header}});r=await invoiceAct(r,'VERIFY_DOCUMENT',verifier);}
  invoices[state]={id:r.id,order_id:orderId,document_id:r.issued_document_id};
 }
 for(const state of ['SUBMITTED','NEEDS_INFO','ANSWERED','CLOSED']){
  let r=await support.create(buyer.ctx,{party_id:buyer.party_id,kind:'FEEDBACK',title:'模拟咨询：'+state,target:null,text:'请体验提交、补充信息和查看答复；不填写真实隐私。',asset_ids:[],operation_key:key()});
  for(const action of (state==='SUBMITTED'?[]:state==='NEEDS_INFO'?['START','REQUEST_INFO']:state==='ANSWERED'?['START','ANSWER']:['START','ANSWER','CLOSE']))r=await support.act(handler.ctx,{ticket_id:r.id,operations:true,action,text:'模拟客服处理结果',asset_ids:[],expected_version:r.object_version,operation_key:key()});
  tickets[state]={id:r.id};
 }
 const collections=load('src/modules/collections/repository').createCollectionsRepository(db,{resolvePrincipal,secret:m.secret});
 await collections.favorite(buyer.ctx,{kind:'STOCK',target_id:m.access.scenarios.stock_paid.listing_id,saved:true,operation_key:key()});
 // A real auth transaction with in-memory delivery will be required; auto-login is not recent proof.
 const auth=load('src/modules/auth/repository').createAuthRepository(db,{secret:m.secret});
 const oldPhone='13900009801',newPhone='13900009802';
 await db.execute('INSERT INTO auth_subjects(phone_hash,account_id) VALUES (?,?)',[auth.secure.digest('phone',oldPhone),buyer.account_id]);
 const directory=load('src/modules/directory/repository').createDirectoryRepository(db,{resolvePrincipal}),fs=require('node:fs');
 for(const [u,action] of [[handler,'SUPPLY_REVIEW_PROFILE'],[handler,'ARTIST_REVIEW_CONTENT'],[verifier,'ARTIST_REVIEW_CONTENT']]){
  const [[g]]=await db.execute('SELECT enabled,object_version FROM governance_operator_grants WHERE account_id=? AND action_code=?',[u.account_id,action]);
  if(!g?.enabled)await load('src/modules/governance/operator-access').maintainOperatorGrant(db,{account_id:u.account_id,action,enabled:true,expected_version:g?.object_version||0,expires_at:null,authority_ref:'synthetic:directory',reason:'仅模拟资料审核'});
 }
 const supplier=people.producer,party=m.tradeEnv.CUSTOMIZATION_MERCHANT_PARTY_ID;
 const storageFactory=()=>require('./synthetic-files.cjs').openFiles(path.join(dir,'assets'));
 const assets=load('src/modules/works/assets').createSupplyAssets({db,repository:load('src/modules/works/repository').createSupplyRepository(db,{resolvePrincipal}),storageFactory});
 const upload=(purpose,media_type,body)=>assets.upload(supplier.ctx,{party_id:party,purpose,media_type,body,operation_key:key()});
 const cover=await upload('WORK_CONTENT','image/jpeg',fs.readFileSync(path.resolve(__dirname,'../../.local/client-samples/test-portrait.jpg'))),proof=await upload('REVIEW_EVIDENCE','text/plain',Buffer.from('Synthetic organization evidence only'));
 const profile={display_name:'模拟光影制作机构',introduction:'仅供目录、搜索和机构管理测试的虚构机构。',city:'郑州',capabilities:[],cover_asset_id:cover.id,evidence_asset_ids:[proof.id],valid_from:new Date(Date.now()-60000).toISOString(),valid_until:new Date(Date.now()+30*86400000).toISOString()};
 let org=await directory.submitOrganization(supplier.ctx,{party_id:party,profile,operation_key:key()});
 org=await directory.review(handler.ctx,{record_id:org.id,expected_version:org.object_version,decision:'APPROVE',reason:'独立复核模拟资料',checks:{identity_verified:true,capabilities_verified:true,materials_reviewed:true,public_display_authorized:true,no_private_contact:true},operation_key:key()});
 const pending=await directory.submitOrganization(supplier.ctx,{party_id:party,profile:{...profile,display_name:'待审核的模拟机构新版'},operation_key:key()});
 const plaza=JSON.parse(fs.readFileSync(path.join(dir,'plaza-enrichment.json'),'utf8'));
 let featured=await directory.proposeFeature(handler.ctx,{feature:{listing_id:plaza['plaza-artist-0'].listing_id,recommendation:'模拟编辑推荐，用于测试，非明星认证',sort_order:10,valid_from:profile.valid_from,valid_until:profile.valid_until},operation_key:key()});
 featured=await directory.review(verifier.ctx,{record_id:featured.id,expected_version:featured.object_version,decision:'APPROVE',reason:'独立复核模拟推荐',checks:{public_source_verified:true,recommendation_reviewed:true,not_star_certification:true},operation_key:key()});
 return {synthetic_only:true,invoices,tickets,directory:{party_id:party,approved_id:org.id,pending_id:pending.id,featured_id:featured.id},collection:{role:'stock_buyer',kind:'STOCK',target_id:m.access.scenarios.stock_paid.listing_id},phone:{role:'stock_buyer',old_phone:oldPhone,new_phone:newPhone},roles:{applicant:'stock_buyer',handler:'stock_reviewer',verifier:'reviewer'},order_id:orderId};
}
module.exports={enrich};
