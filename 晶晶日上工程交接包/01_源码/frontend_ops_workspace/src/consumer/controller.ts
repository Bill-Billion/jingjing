import { ApiError, outcomeUnknown, type ApiResult, type RequestOptions } from '@/api/client'
export type Target=Record<string,string|number>
export interface Preview {configured:boolean;required:boolean;rule_id:string|null;preview_sha256:string|null;reasons:string[];message:string|null;target:Target;expires_in_seconds:number|null}
export interface Command {scope:string;path:string;body:unknown;key:string;party:string;version?:string|number;target:Target;sent:boolean;ack?:{key:string;hash:string};route:string}
export interface RiskContext {scope:string;token:string;party:string;personal:boolean;current():boolean}
export interface RiskIO {
 context():RiskContext|null;send(path:string,o:RequestOptions):Promise<ApiResult<unknown>>;newKey():string;
 validate?(result:ApiResult<unknown>,command:Command):void;recovered?(command:Command,result:ApiResult<unknown>):void;
 load():{command?:Command;receipts:string[]};save(value:{command?:Command;receipts:string[]}):void;changed():void;route():string
}
const prefix='/wallet/consumer-risk'
const renewal=new Set(['CONSUMER_RISK_CONFIRMATION_REQUIRED','CONSUMER_RISK_CONFIRMATION_EXPIRED','CONSUMER_RISK_PREVIEW_CHANGED'])
const fail=(code:string,message:string,status=409)=>new ApiError({status,code,message})
export function consumptionTarget(path:string,o:RequestOptions):Target|null {
 if(o.method!=='POST'||!o.idempotencyKey)return null
 const b=o.body as Record<string,unknown>|undefined,key=o.idempotencyKey
 if(path==='/trade/payments'&&typeof b?.order_id==='string'&&typeof b.installment_key==='string')return{kind:'PAYMENT',order_id:b.order_id,installment_key:b.installment_key,request_key:key}
 if(path==='/wallet/recharges'&&Number.isSafeInteger(b?.amount_minor))return{kind:'RECHARGE',amount_minor:Number(b?.amount_minor),request_key:key}
 if(path==='/redemption/draws'&&typeof b?.pool_id==='string'&&[1,10].includes(Number(b.count)))return{kind:'LOTTERY',pool_id:b.pool_id,count:Number(b.count),request_key:key}
 const m=/^\/trade\/payments\/([a-f0-9-]{36})\/reconciliation$/.exec(path)
 return m?{kind:'PAYMENT_RECORD',payment_id:m[1]!}:null
}
export function consumerPreview(value:unknown,target:Target):Preview {
 const p=value as Preview,ok=!!p&&typeof p.configured==='boolean'&&typeof p.required==='boolean'&&Array.isArray(p.reasons)&&p.reasons.every(x=>typeof x==='string')&&!!p.target&&Object.entries(target).every(([k,v])=>k==='kind'&&v==='PAYMENT_RECORD'?p.target.kind==='PAYMENT':p.target[k]===v)
 if(!ok||p.required&&(!p.configured||typeof p.message!=='string'||!p.message.trim()||!/^\w{64}$/.test(p.preview_sha256||'')||!Number.isSafeInteger(p.expires_in_seconds)||Number(p.expires_in_seconds)<1))throw fail('UNEXPECTED_RESPONSE_SHAPE','本次消费提示无法核对，未继续消费。',200)
 return p
}
/** One explicit action at a time. No retry is made without a new user click. */
export class ConsumerController {
 command:Command|null=null;preview:Preview|null=null;message='';busy=false;phase:'read'|'recover'|'preview'|'resume'|null=null;result:Record<string,unknown>|null=null
 blocked=false;private choice:((ok:boolean)=>void)|null=null;private active=false;private generation=0;private receipts:string[]=[]
 constructor(private io:RiskIO){this.restore()}
 private publish(){this.io.changed()}
 private persist(){this.io.save({...(this.command?{command:this.command}:{}),receipts:this.receipts.slice(-32)})}
 restore(){const c=this.io.context();this.command=null;this.preview=null;this.message='';this.result=null;this.blocked=false;try{const saved=this.io.load();this.receipts=Array.isArray(saved.receipts)?saved.receipts.filter(x=>typeof x==='string'):[];const cmd=saved.command;if(c?.current()&&cmd?.scope===c.scope&&cmd.party===c.party&&cmd.key&&JSON.stringify(cmd.target)===JSON.stringify(consumptionTarget(cmd.path,{method:'POST',body:cmd.body,idempotencyKey:cmd.key}))){this.command=cmd;this.phase='resume';this.message='有一项原消费操作待核对。请手动恢复，勿再次下单。'}else {this.phase=null;if(cmd&&c&&cmd.scope===c.scope)throw new Error('invalid original command')}}catch{this.blocked=true;this.message='无法读取原消费记录，请恢复浏览器存储后再办理。'}this.publish()}
 contextChanged(){this.generation++;this.choice?.(false);this.choice=null;this.active=false;this.busy=false;this.restore()}
 choose(ok:boolean){const f=this.choice;if(!f)return;this.choice=null;this.phase=null;this.publish();f(ok)}
 private async ask(phase:NonNullable<ConsumerController['phase']>,g:number){this.busy=false;this.phase=phase;this.publish();const ok=await new Promise<boolean>(resolve=>{this.choice=resolve});if(g!==this.generation)throw fail('CONTEXT_CHANGED','身份或登录已变化，本次未自动继续。');if(!ok)throw fail('CONSUMER_CONFIRMATION_CANCELLED','已停止本次消费，请核对原业务状态。');this.busy=true;this.publish()}
 private valid(ctx:RiskContext,g:number){if(g!==this.generation||!ctx.current())throw fail('CONTEXT_CHANGED','身份或权限已变化，本次未自动继续。')}
 async intercept(path:string,o:RequestOptions):Promise<ApiResult<unknown>> {
  const t=consumptionTarget(path,o),ctx=this.io.context()
  if(!t)return this.io.send(path,o)
  if(this.blocked)throw fail('CONSUMER_RECOVERY_UNAVAILABLE',this.message)
  if(!ctx||o.actingParty!==ctx.party||o.token!==ctx.token)throw fail('CONTEXT_CHANGED','身份或登录已变化，请先核对当前账号。')
  if(!ctx.personal)return this.io.send(path,o)
  if(this.active)throw fail('CONSUMER_OPERATION_PENDING','请先处理当前消费确认。')
  if(this.command&&this.command.scope===ctx.scope&&this.command.key!==o.idempotencyKey)throw fail('CONSUMER_OPERATION_PENDING','原消费结果尚待核对，请先恢复原操作。')
  const same=this.command?.scope===ctx.scope&&this.command.key===o.idempotencyKey
  if(same&&(this.command!.path!==path||JSON.stringify(this.command!.body)!==JSON.stringify(o.body)))throw fail('CONSUMER_OPERATION_CHANGED','恢复时必须保持原金额、目标和请求。')
  const c:Command=same?this.command!:{scope:ctx.scope,path,body:JSON.parse(JSON.stringify(o.body??{})),key:o.idempotencyKey!,party:ctx.party,version:o.ifMatch,target:t,sent:this.receipts.includes(ctx.scope+'|'+o.idempotencyKey),route:this.io.route()}
  this.command=c;return this.run(ctx,c,o)
 }
 async resume(){const ctx=this.io.context(),c=this.command;if(!ctx||!c||ctx.scope!==c.scope||this.active)return;try{const r=await this.run(ctx,c,{method:'POST',token:ctx.token,actingParty:c.party,body:c.body,idempotencyKey:c.key,ifMatch:c.version});this.io.recovered?.(c,r);this.result=r.data as Record<string,unknown>;this.message='原操作已恢复，请刷新原业务记录核对最终状态。'}catch(e){this.message=e instanceof Error?e.message:'原操作尚未完成。'}this.publish()}
 private async run(ctx:RiskContext,c:Command,o:RequestOptions):Promise<ApiResult<unknown>> {
  const g=this.generation;this.active=true;this.busy=true;this.result=null;this.message='';this.phase=null;this.persist();this.publish()
  const send=(path:string,opts:RequestOptions)=>{this.valid(ctx,g);return this.io.send(path,{...opts,token:ctx.token,actingParty:'actingParty' in opts?opts.actingParty:ctx.party})}
  const read=async()=>{const query=new URLSearchParams(Object.entries(c.target).map(([k,v])=>[k,String(v)]));try{return consumerPreview((await send(prefix+'/preview?'+query,{cache:'no-store'})).data,c.target)}catch(e){if(c.target.kind==='PAYMENT_RECORD'&&e instanceof ApiError&&e.code==='CONSUMER_TARGET_NOT_PENDING')return null;throw e}}
  try {
   for(;;){
    this.valid(ctx,g)
    // A dispatched/unknown command must first recover its original result, even
    // when the target is no longer pending or today's policy has changed.
    if(!c.sent){
     if(c.ack){
      this.message='上次阅读确认结果待核对，将沿原确认请求恢复。';await this.ask('recover',g)
      try{await send(prefix+'/confirm',{method:'POST',idempotencyKey:c.ack.key,body:{target:c.target,preview_sha256:c.ack.hash,read_confirmed:true}})}catch(e){if(e instanceof ApiError&&renewal.has(e.code)){c.ack=undefined;this.persist()}else throw e}
     }
     const p=await read();this.valid(ctx,g);this.preview=p
     if(p&&!p.configured&&c.target.kind==='LOTTERY'){
      const r=(await send('/redemption/pools/'+c.target.pool_id,{actingParty:null,cache:'no-store'})).data as {data?:{config?:{source_profile?:string}}}
      this.valid(ctx,g);if(r?.data?.config?.source_profile==='CONTRACT_20261029')throw fail('CONSUMER_POLICY_NOT_CONFIGURED','活动保护规则待审核，暂不可参与。')
     }
     if(p?.required){
      this.message='请阅读本次提示并主动确认；确认成功后才继续原操作。'
      await this.ask('read',g)
      c.ack={key:this.io.newKey(),hash:p.preview_sha256!};this.persist()
      try{const ack=(await send(prefix+'/confirm',{method:'POST',idempotencyKey:c.ack.key,body:{target:c.target,preview_sha256:c.ack.hash,read_confirmed:true}})).data as {current_status?:string;owner_party_id?:string;data?:{preview?:{preview_sha256?:string}}};this.valid(ctx,g);if(ack?.current_status!=='CONFIRMED'||ack.owner_party_id!==ctx.party||ack.data?.preview?.preview_sha256!==c.ack.hash)throw fail('UNEXPECTED_RESPONSE_SHAPE','阅读确认返回无法核对，请恢复原确认。',200)}
      catch(e){if(e instanceof ApiError&&renewal.has(e.code)){c.ack=undefined;this.persist();this.message='规则或消费状态已变化，请重新读取并确认。';await this.ask('preview',g);continue}throw e}
     }
    }
    this.valid(ctx,g);c.sent=true;this.persist()
    try{const result=await send(c.path,o);this.valid(ctx,g);this.io.validate?.(result,c);this.receipts.push(ctx.scope+'|'+c.key);this.command=null;this.preview=null;this.persist();return result}
    catch(e){if(e instanceof ApiError&&renewal.has(e.code)){c.sent=false;c.ack=undefined;this.persist();this.message='原确认已过期或规则变化；原消费请求保留，请重新读取。';await this.ask('preview',g);continue}throw e}
   }
  }catch(e){
   if(g===this.generation){if(!outcomeUnknown(e)&&!(e instanceof ApiError&&e.code==='CONSUMER_CONFIRMATION_CANCELLED'&&c.sent)){this.command=null;this.persist()}this.message=e instanceof Error?e.message:'结果尚未确认。';if(this.command){this.phase='resume';this.message='结果待核对，请恢复同一操作；不要换金额或重新下单。'}}throw e
  }finally{if(g===this.generation){this.active=false;this.busy=false;this.choice=null;if(!this.command)this.phase=null;this.publish()}}
 }
}
