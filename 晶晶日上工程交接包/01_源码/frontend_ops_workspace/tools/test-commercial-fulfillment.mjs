import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createSSRApp,h} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {createPinia} from 'pinia'
import {createRouter,createMemoryHistory} from 'vue-router'
const root=fileURLToPath(new URL('..',import.meta.url)),server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':`${root}/src`}},server:{middlewareMode:true},appType:'custom'}),id=n=>`${String(n).padStart(8,'0')}-0000-4000-8000-000000000001`
const storage=new Map();Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}})
try{
 const api=await server.ssrLoadModule('/src/api/modules/finance.ts')
 const a={model:'V5_TWO_LAYER',product_type:'COMMERCIAL',fee_base:'NET_PAID',platform_party_id:id(1),platform_bps:2200,supplier_party_id:id(2),mcn_party_id:id(3),mcn_supply_bps:2000,referrer_party_id:null,referral_bps:0,rounding:'LARGEST_REMAINDER_PLATFORM_MAX_ONE_FEN'}
 const r={version:'frozen1',settlement_at:'2020-01-01T00:00:00.000Z',release_condition:'DELIVERY_ACCEPTED',terms:'Original frozen terms',lines:[{line_id:'commercial',allocation:a,deductions:[]}]}
 assert.equal(api.isRules(r),true)
 for(const edit of [x=>x.lines[0].shares=[{party_id:id(2),bps:10000,role:'SUPPLIER'}],x=>x.lines[0].allocation.platform_bps=10001,x=>x.lines[0].allocation.mcn_supply_bps=3001,x=>x.lines[0].allocation.supplier_party_id=id(1),x=>x.lines[0].allocation.referral_bps=2201,x=>x.lines[0].deductions=[{category:'OTHER',party_id:id(99),amount_minor:1,basis:'Wrong party',refund_behavior:'RETAIN'}]]){const bad=structuredClone(r);edit(bad);assert.equal(api.isRules(bad),false)}
 const trade=await server.ssrLoadModule('/src/api/modules/trade.ts'),{createRuleContent}=createRequire(import.meta.url)('../../backend_server/src/modules/governance/content')
 const legacy={...r,lines:[{line_id:'old',shares:[{party_id:id(1),bps:2200,role:'PLATFORM'},{party_id:id(2),bps:7800,role:'SUPPLIER'}],deductions:[]}]};assert.equal(api.isRules(legacy),true);const cf={model:'V5_SELF_OPERATED',platform_party_id:id(1),rounding:'HALF_UP_PLATFORM_REMAINDER',rules:legacy,rule_snapshot:{content:createRuleContent({id:id(55),rule_key:'synthetic.finance',version:'1',terms:{test:true}}),current_status:'EFFECTIVE',effective_at:'2020-01-01T00:00:00.000Z'}};assert.equal(trade.isCustomizationFinance(cf),true);assert.equal(trade.isCustomizationFinance({...cf,rules:r}),false);legacy.lines[0].shares[1].bps=7799;assert.equal(api.isRules(legacy),false)
 const {useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts'),{default:View}=await server.ssrLoadModule('/src/views/ProductionView.vue'),pinia=createPinia(),session=useSessionStore(pinia);session.token='synthetic';session.account={id:id(7),display_name:'本人制作',current_status:'ACTIVE',object_version:1,allowed_actions:[]};session.parties=[{party:{id:id(8),kind:'PERSON',current_status:'ACTIVE',display_name:'本人',object_version:1,capabilities:[],allowed_actions:[]},membership:{id:id(9),account_id:id(7),party_id:id(8),current_status:'ACTIVE',roles:['OWNER'],object_version:1,allowed_actions:[]}}];session.selectParty(id(8));const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:View}]});await router.push('/production/projects');await router.isReady();let vm;const app=createSSRApp({render:()=>h(View)}).use(pinia).use(router);app.mixin({created(){if(this.$options.__name==='ProductionView')vm=this.$.setupState}});await renderToString(app)
 assert.equal(vm.selfAssignable,true);session.parties[0].membership.account_id=id(99);assert.equal(vm.selfAssignable,false);session.parties[0].membership.account_id=id(7);session.parties[0].membership.current_status='SUSPENDED';assert.equal(vm.selfAssignable,false);session.parties[0].membership.current_status='ACTIVE';session.account.current_status='SUSPENDED';assert.equal(vm.selfAssignable,false);session.account.current_status='ACTIVE';session.parties[0].party.kind='ORGANIZATION';assert.equal(vm.selfAssignable,false);session.token=null
 console.log('16 commercial allocation validation, legacy conservation and personal assignee checks passed')
}finally{await server.close()}
