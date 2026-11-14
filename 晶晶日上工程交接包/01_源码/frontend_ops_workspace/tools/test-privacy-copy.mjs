import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {createServer} from 'vite'
import vue from '@vitejs/plugin-vue'
import {createSSRApp,h} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {createPinia} from 'pinia'
const root=fileURLToPath(new URL('..',import.meta.url)),saved=globalThis.fetch
const server=await createServer({root,configFile:false,plugins:[vue()],resolve:{alias:{'@':root+'/src'}},server:{middlewareMode:true,hmr:false},appType:'custom'})
const storageDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage'),storage=new Map()
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}})
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const reply=data=>new Response(JSON.stringify({meta:{request_id:'test',actor:{account_id:id(1)},acting_party:null},data}),{headers:{'Content-Type':'application/json'}})
const page=(cursor=null)=>({section:'ACCOUNT',coverage:'OWN_ACCOUNT_RECORDS_ONLY',request_completion:'NOT_CONFIRMED',items:[],next_cursor:cursor})
try{
 const m=await server.ssrLoadModule('/src/business/privacyCopy.ts')
 const {useSessionStore}=await server.ssrLoadModule('/src/stores/session.ts')
 const {default:Panel}=await server.ssrLoadModule('/src/components/business/PrivacyCopyPanel.vue')
 const source=m.copySources.find(s=>s.key==='account:ACCOUNT')
 assert.equal(m.copySources.length,59)
 assert(!m.availableCopySources(['PROFILE']).some(s=>s.scope==='TRANSACTIONS'))
 assert.throws(()=>m.copyPath('bad',source))
 assert.throws(()=>m.copyPath(id(2),m.copySources.find(s=>s.key==='trade:SUMMARY')))
 assert.equal(m.copyBundle(id(2),source,'',[page('c1')],'尚有其他类别').selected_source_complete,false)
 assert.equal(m.copyBundle(id(2),source,'',[page('c1'),page()],'原件另核').selected_source_complete,true)
 assert.throws(()=>m.copyBundle(id(2),source,'',[page(),page()],'其他类别'))
 assert.throws(()=>m.checkCopyPage({...page(),section:'WALLET'},source,'',null))
 assert.throws(()=>m.checkCopyPage(page('c1'),source,'','c1'))
 assert.throws(()=>m.checkCopyPage(page('c1'),source,'','c2',['c1']))
 let calls=0,prepared,vm
 const pinia=createPinia(),s=useSessionStore(pinia);s.token='test';s.account={id:id(1),display_name:'测试账号'};s.expiresAt='2099-01-01T00:00:00Z'
 const app=createSSRApp({render:()=>h(Panel,{request:{id:id(2),object_version:1,request:{type:'COPY',scopes:['ALL']}},onPrepared:f=>prepared=f})}).use(pinia)
 app.mixin({created(){if(this.$options.__name==='PrivacyCopyPanel')vm=this.$.setupState},async serverPrefetch(){if(this.$options.__name!=='PrivacyCopyPanel')return
   vm.sourceKey='account:ACCOUNT'
   globalThis.fetch=async(url,o)=>{assert(!o.headers['X-Acting-Party']);assert(String(url).includes('/operations/requests/'+id(2)+'/'));calls++;return reply(page(calls===1?'c1':null))}
   await vm.loadPage();assert.equal(vm.pages.length,1);await vm.loadPage(true);assert.equal(vm.pages.length,2)
   vm.remaining='其他类别和原件仍需逐项核对';vm.collect();assert.equal(vm.collected.length,1)
   globalThis.fetch=async()=>reply({categories:[],request_completion:'NOT_CONFIRMED'});await vm.prepare();assert(prepared);assert.equal(prepared.type,'text/plain');const body=JSON.parse(await prepared.text());assert.equal(body.request_id,id(2));assert.equal(body.copies[0].pages.length,2)
   globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'ACCESS_DENIED',message:'权限撤回'}}),{status:403,headers:{'Content-Type':'application/json'}});await vm.loadPage();assert.equal(vm.pages.length,0);assert.equal(vm.collected.length,0);assert(vm.error.includes('清除'))
 }})
 const html=await renderToString(app);assert(html.includes('同一份申请'));console.log('privacy copy: 10 contract checks and same-request page/prepare/revocation component flow passed')
 // New publishing policy must survive form encoding and backend validation.
 const {notices}=await server.ssrLoadModule('/src/business/notices.ts'),{encode}=await server.ssrLoadModule('/src/business/model.ts')
 const form=notices.operations.find(x=>x.key==='rule')
 assert(form.fields.find(x=>x.key==='rule').fields.some(x=>x.key==='publishing_policy'))
 console.log('notice publishing form exposes an explicit current versus historical policy')
}finally{globalThis.fetch=saved;if(storageDescriptor)Object.defineProperty(globalThis,'sessionStorage',storageDescriptor);else delete globalThis.sessionStorage;await server.close()}
