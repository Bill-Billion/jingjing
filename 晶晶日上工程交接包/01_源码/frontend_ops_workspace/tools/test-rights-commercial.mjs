import assert from 'node:assert/strict'
import {createSSRApp,h} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {createRouter,createMemoryHistory} from 'vue-router'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true,hmr:false},appType:'custom'})
let count=0
try {
 const trade=await server.ssrLoadModule('/src/api/modules/trade.ts')
 const stock={scope:'COMMERCIAL_LIMITED',exclusive:false,territory:'CN',duration:'FIXED_TERM',personal_social_sharing:false,acceptance_hours:48,aftercare_terms:'独立审核原单售后',commercial_uses:['BRAND_PROMOTION'],valid_from:'2026-01-01T00:00:00.000Z',valid_until:'2027-01-01T00:00:00.000Z'}
 assert.equal(trade.isStockLicense(stock),true,'当前商用许可必须可读');count++
 const {default:Overview}=await server.ssrLoadModule('/src/components/business/BusinessOverview.vue'),router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]});await router.push('/');const commercialHtml=await renderToString(createSSRApp({render:()=>h(Overview,{domain:'stock',record:{license:stock,unit_minor:50000}})}).use(router));assert.match(commercialHtml,/品牌宣传/);assert.match(commercialHtml,/CN/);assert.equal(commercialHtml.includes('仅限本人收藏及个人社交分享 · 非商用'),false);count++

 for(const mutate of [s=>s.commercial_uses=[],s=>s.commercial_uses=['ADAPTATION'],s=>s.commercial_uses.push('BRAND_PROMOTION'),s=>s.valid_until=s.valid_from,s=>s.personal_social_sharing=true,s=>s.territory='']){const s=structuredClone(stock);mutate(s);assert.equal(trade.isStockLicense(s),false);count++}
 const terms={version:'CONTRACT_20261029',mode:'BUYER_OWNERSHIP',buyout_price_included:true,license:null,personality_rights_retained:true,underlying_assets_excluded:true,third_party_licenses_retained:true}
 const film={version:'版权规格',service_tier:'明确成片',sample_seconds:10,final_seconds:60,revision_limit:1,deliverables:['成片'],terms:'原约定',copyright_terms:terms}
 assert.equal(trade.isSpecification(film),true);count++
 for(const mutate of [s=>s.copyright_terms.mode='GUESSED',s=>s.copyright_terms.personality_rights_retained=false,s=>s.copyright_terms.buyout_price_included=false,s=>s.copyright_terms.license={}]){const s=structuredClone(film);mutate(s);assert.equal(trade.isSpecification(s),false,'不可把矛盾版权响应当成旧合同');count++}
 const rights=await server.ssrLoadModule('/src/api/modules/rights.ts')
 const licensed={...terms,mode:'PRODUCER_OWNERSHIP_LICENSE',buyout_price_included:false,license:{scope:'PERSONAL_NONCOMMERCIAL',territories:['CN'],purposes:['PRIVATE'],perpetual:true,exclusive:false,transferable:false,sublicensable:false,terms_text:'仅个人使用'}}
 assert.ok(rights.isCopyrightTerms(licensed));count++
 licensed.license.purposes=['COMMERCIAL'];assert.equal(rights.isCopyrightTerms(licensed),false);count++
 licensed.license.scope='AGREED_SCOPE';assert.ok(rights.isCopyrightTerms(licensed));count++
 const ip=await server.ssrLoadModule('/src/api/modules/procurement.ts'),licensing=await server.ssrLoadModule('/src/api/modules/licensing.ts')
 const buyout={contract_kind:'IP_BUYOUT_20261029',exclusive:true,rights:[...ip.ipRights],purposes:['PRIVATE','PUBLIC_SHARE','COMMERCIAL','RELEASE'],territories:['WORLD'],languages:['ALL'],valid_from:'2024-02-29T00:00:00.000Z',valid_until:null,development_until:null,project_limit:null,episode_limit:null,terms_text:'原合同永久全球独家'}
 assert.ok(licensing.isTerms(buyout));count++
 const share={...buyout,contract_kind:'IP_REVENUE_SHARE_20261029',valid_until:'2029-02-28T00:00:00.000Z',development_until:'2026-02-28T00:00:00.000Z'}
 assert.ok(licensing.isTerms(share));count++
 assert.equal(licensing.isTerms({...share,valid_until:'2029-03-01T00:00:00.000Z'}),false);count++
 const malformed={...buyout};delete malformed.contract_kind;assert.equal(licensing.isTerms(malformed),false);count++
 const id='11111111-1111-4111-8111-111111111111',procurement={version:'CONTRACT_20261029',mode:'BUYOUT',buyer_party_id:id,upfront_minor:5000000,royalty_bps:0,sublicensing_allowed:true,attribution_terms:'作者署名',rights_evidence:{rights_chain_ids:[id],ownership_proof_ids:[id],original_creation_ids:[id],has_coauthors:false,coauthor_consent_ids:[]},settlement_annex:null}
 assert.ok(ip.procurementMatches(procurement,buyout,{currency:'CNY',amount_minor:5000000},5000000));count++
 for(const mutate of [p=>p.royalty_bps=800,p=>p.rights_evidence.rights_chain_ids=[],p=>p.rights_evidence.has_coauthors=true,p=>p.upfront_minor=0]){const p=structuredClone(procurement);mutate(p);assert.equal(ip.isProcurement(p),false);count++}
 assert.equal(ip.procurementMatches(procurement,buyout,{currency:'CNY',amount_minor:100},100),false);count++
 const statement={period_from:'2026-01-01T00:00:00.000Z',period_until:'2026-02-01T00:00:00.000Z',income_minor:-10000,platform_minor:0,tax_minor:0,distribution_minor:0,production_minor:0,evidence_asset_ids:[id],external_reference:'correction',note:'原有退款更正依据'}
 const royalty={project_id:id,statement,evidence_asset_ids:[id],calculation:{currency:'CNY',royalty_bps:800,project_net_minor:-10000,cumulative_accrued_minor:0,adjustment_minor:-800,payment_state:'NOT_TRANSFERRED',rounding:'CUMULATIVE_FLOOR_TO_FEN'},review:{decision:'APPROVED',reason:'独立核对',reviewer_account_id:id}}
 assert.ok(ip.isRoyaltyData(royalty));count++
 royalty.calculation.payment_state='TRANSFERRED';assert.equal(ip.isRoyaltyData(royalty),false);count++
 assert.equal(ip.signedMinorInput('-800'),-800);count++
 assert.equal(ip.signedMinorInput('1.5'),null);count++
 const {actionAvailability}=await server.ssrLoadModule('/src/business/availability.ts'),{domains}=await server.ssrLoadModule('/src/business/index.ts');
 const operation=domains.participation.operations.find(o=>o.key==='manual-confirm'),sample={object_version:1,request_id:id,data:{rights_owner_party_id:id,confirmation:null}},context={accountId:id,partyId:'22222222-2222-4222-8222-222222222222',membershipActive:true,owner:true};
 assert.equal(actionAvailability('participation',operation,sample,context).blocked,true);count++
 assert.equal(actionAvailability('participation',operation,sample,{...context,partyId:id}).blocked,false);count++
 sample.data.confirmation={account_id:id};assert.equal(actionAvailability('participation',operation,sample,{...context,partyId:id}).blocked,true);count++
 assert.equal(domains.participation.sections.find(x=>x.key==='manual-confirmation').files[0].type,'video/mp4');count++
 console.log(`rights-commercial: ${count} assertions passed`)
}finally{await server.close()}
