import { ApiError, asApiError, outcomeUnknown } from '@/api/client'
export interface Usage {
 night_reminder?:{enabled:boolean;due:boolean;timezone:'Asia/Shanghai';start_minute:number;end_minute:number};object_version:number;enabled:boolean;local_date:string;timezone:'Asia/Shanghai';day_seconds:number;reminder_seconds:number;rest_reminder_minutes:number;rest_due:boolean;seconds_until_reminder:number|null;heartbeat_seconds:30;idle_after_seconds:90;as_of:string;measurement:'FOREGROUND_HEARTBEAT_ESTIMATE';purpose:'PERSONAL_REST_REMINDER'
}
export function usage(value:unknown):Usage {
 const x=value as Usage, integer=(v:unknown,max=86400)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max
 if(!x||!integer(x.object_version,Number.MAX_SAFE_INTEGER)||typeof x.enabled!=='boolean'||!/^\d{4}-\d{2}-\d{2}$/.test(x.local_date)||x.timezone!=='Asia/Shanghai'||!integer(x.day_seconds)||!integer(x.reminder_seconds)||!(x.rest_reminder_minutes===0||integer(x.rest_reminder_minutes,240)&&x.rest_reminder_minutes>=15)||typeof x.rest_due!=='boolean'||!(x.seconds_until_reminder===null||integer(x.seconds_until_reminder))||x.heartbeat_seconds!==30||x.idle_after_seconds!==90||!Number.isFinite(Date.parse(x.as_of))||x.measurement!=='FOREGROUND_HEARTBEAT_ESTIMATE'||x.purpose!=='PERSONAL_REST_REMINDER')throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'统计返回格式无法核对。'})
 const n=x.night_reminder;if(n!==undefined&&(!n||typeof n.enabled!=='boolean'||typeof n.due!=='boolean'||n.timezone!=='Asia/Shanghai'||!integer(n.start_minute,1439)||!integer(n.end_minute,1439)||n.start_minute===n.end_minute))throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'夜间提醒返回无法核对。'})
 return x
}
export interface UsageAck {version:number;key:string}
export interface UsageIO {read():Promise<unknown>;pulse():Promise<unknown>;ack(command:UsageAck):Promise<unknown>;newKey():string;restore():UsageAck|null;save(command:UsageAck):void;remove(command:UsageAck):void;changed():void;nightSeen?(date:string):boolean;markNightSeen?(date:string):void}
/** One foreground sampler. No offline queue and no client-supplied clock. */
export class UsageController {
 data:Usage|null=null; nightVisible=false;private nightDate:string|null=null; error=''; busy=false; pending:UsageAck|null=null
 private timer:ReturnType<typeof setTimeout>|null=null;private generation=0;private running=0;private visible=false;private active=false
 constructor(private io:UsageIO){}
 private cancel(){if(this.timer!==null)clearTimeout(this.timer);this.timer=null}
 private publish(){this.io.changed()}
 private schedule(){this.cancel();if(this.active&&this.visible&&(this.data?.night_reminder?.enabled||!this.pending&&this.data?.enabled))this.timer=setTimeout(()=>void(this.data?.enabled&&!this.pending?this.sample():this.refresh()),30000)}
 start(){this.stop();this.active=true;try{this.pending=this.io.restore()}catch{this.error='原提醒确认无法读取，请重新登录后核对。';this.publish();return}this.visible=true;void this.refresh()}
 stop(){this.cancel();this.generation++;this.running=0;this.active=false;this.data=null;this.nightVisible=false;this.nightDate=null;this.error='';this.busy=false;this.pending=null;this.publish()}
 setVisible(value:boolean){if(value===this.visible)return;this.visible=value;this.cancel();this.generation++;this.running=0;this.busy=false;if(value&&this.active)void this.refresh();else this.publish()}
 private failure(e:unknown){const err=asApiError(e);this.data=null;this.nightVisible=false;this.error=[401,403,404].includes(err.status)?'本人统计当前不可访问。':'统计暂不可用，请稍后重试。'}
 async refresh(){return this.fetch(false)}
 private async sample(){return this.fetch(true)}
 private async fetch(pulse:boolean){if(!this.active||!this.visible||this.running||pulse&&(!this.data?.enabled||this.pending))return;this.cancel();const g=this.generation;this.running++;this.busy=true;this.publish();try{const d=usage(await(pulse?this.io.pulse():this.io.read()));if(g!==this.generation||!this.active)return;this.data=d;this.showNight(d);this.error='';if(!d.enabled&&this.pending){this.io.remove(this.pending);this.pending=null}}catch(e){if(g===this.generation)this.failure(e)}finally{if(g===this.generation){this.running=0;this.busy=false;this.publish();this.schedule()}}}
 private showNight(d:Usage){if(!d.night_reminder?.due){this.nightVisible=false;return}if(this.nightDate===d.local_date)return;this.nightDate=d.local_date;try{if(this.io.nightSeen?.(d.local_date))return;this.io.markNightSeen?.(d.local_date)}catch{/* This foreground session still shows at most once. */}this.nightVisible=true}
 dismissNight(){this.nightVisible=false;this.publish()}
 async acknowledge(recover=false){
  if(!this.active||!this.visible||this.running)return
  if(recover){await this.refresh();if(!this.pending||!this.data?.enabled)return}
  if(!recover&&(!this.data?.rest_due||this.pending))return
  this.cancel();const g=this.generation,command=this.pending||{version:this.data!.object_version,key:this.io.newKey()}
  try{this.io.save(command)}catch{this.error='无法保存原提醒确认，请先恢复本地存储。';this.publish();return}
  this.pending=command;this.busy=true;this.running++;this.error='';this.publish()
  try{const r=await this.io.ack(command) as {acknowledged?:unknown};if(g!==this.generation||!this.active)return;if(r?.acknowledged!==true)throw new ApiError({status:200,code:'UNEXPECTED_RESPONSE_SHAPE',message:'确认结果无法核对'});this.io.remove(command);this.pending=null}
  catch(e){if(g!==this.generation)return;const err=asApiError(e);if(!outcomeUnknown(err)){this.io.remove(command);this.pending=null}this.error=this.pending?'确认结果待核对；心跳已暂停，请恢复同一次确认。':err.status===412?'提醒状态已变化，请核对当前提示后再次确认。':err.code==='REST_REMINDER_NOT_DUE'?'原提醒已不再到期。':'提醒确认失败，请核对当前状态。'}
  finally{if(g===this.generation){this.running=0;this.busy=false;const message=this.error;if(!this.pending)await this.refresh();if(message){this.error=message;this.publish()}}}
 }
}
export const usageDuration=(seconds:number)=>`${Math.floor(seconds/3600)}小时${Math.floor(seconds%3600/60)}分钟`
