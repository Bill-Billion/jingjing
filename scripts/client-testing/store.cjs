const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
function fault(status, message) { return Object.assign(new Error(message), {status}); }
function openStore(dir) {
  fs.mkdirSync(dir, {recursive:true, mode:0o700});
  const lock = path.join(dir, 'writer.lock');
  let fd; try { fd=fs.openSync(lock,'wx',0o600); } catch { throw Error('记录目录已被使用；确认原进程退出后才能移除 writer.lock，禁止同时启动两个写入服务。'); }
  fs.writeFileSync(fd,String(process.pid));
  const file=path.join(dir,'records.json');
  let data;
  try { data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{issues:[],results:[],commands:{}}; assert(Array.isArray(data.issues)&&Array.isArray(data.results)&&data.commands); }
  catch(e){fs.closeSync(fd);fs.unlinkSync(lock);throw e;}
  function save(next) {
    const text=JSON.stringify(next); if(Buffer.byteLength(text)>150*1024*1024)throw fault(507,'记录空间已达本轮上限，请联系测试负责人导出。');
    const tmp=file+'.tmp'; const out=fs.openSync(tmp,'w',0o600);
    try{fs.writeFileSync(out,text);fs.fsyncSync(out);}finally{fs.closeSync(out);}
    fs.renameSync(tmp,file); data=next;
  }
  const allowed=(actor,row)=>actor.reviewer||row.owner===actor.id;
  function mutate(actor,key,payload,fn){
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(key||''))throw fault(400,'缺少有效的请求编号');
    const k=sha(actor.id+'|'+key),fingerprint=sha(JSON.stringify(payload));
    if(data.commands[k]){const old=data.commands[k];if(old.fingerprint!==fingerprint)throw fault(409,'原请求内容不同，请保留原反馈再试。');return old.result;}
    if(Object.keys(data.commands).length>=5000)throw fault(507,'本轮记录数量已达上限');
    const next=structuredClone(data),result=fn(next);next.commands[k]={fingerprint,result};save(next);return result;
  }
  return {
    list(actor){return {issues:data.issues.filter(r=>allowed(actor,r)).map(({image,...r})=>({...r,has_image:!!image})),results:data.results.filter(r=>allowed(actor,r))};},
    image(actor,id){const r=data.issues.find(r=>r.id===id);if(!r||!allowed(actor,r)||!r.image)throw fault(404,'截图不存在或无权查看');return r.image;},
    create(actor,key,payload){return mutate(actor,key,payload,n=>{if(n.issues.length>=1000)throw fault(507,'本轮问题数量已达上限'); const row={...payload,id:crypto.randomUUID(),number:'TEST-'+String(n.issues.length+1).padStart(4,'0'),owner:actor.id,reporter:actor.name,status:'NEW',version:1,created_at:new Date().toISOString(),history:[]};n.issues.push(row);const {image,...publicRow}=row;return {...publicRow,has_image:!!image};});},
    update(actor,id,version,payload){
      const index=data.issues.findIndex(r=>r.id===id);const old=data.issues[index];if(!old||!allowed(actor,old))throw fault(404,'问题不存在或无权查看');
      if(old.version!==version)throw fault(409,'问题已有新进度，请刷新后重试。');
      const reviewStates=['NEEDS_INFO','REPRODUCED','FIXING','RETEST'];
      if(actor.reviewer){if(!reviewStates.includes(payload.status))throw fault(403,'工作人员不能代甲方确认解决');}
      else if(!(old.status==='RETEST'&&['RESOLVED','REOPENED'].includes(payload.status))&&!(old.status==='NEEDS_INFO'&&payload.status==='NEW'))throw fault(403,'请按当前进度补充或复测');
      const n=structuredClone(data),r=n.issues[index];r.status=payload.status;r.version++;r.history.push({actor:actor.name,status:payload.status,note:payload.note,at:new Date().toISOString()});save(n);const {image,...result}=r;return {...result,has_image:!!image};
    },
    result(actor,key,payload){return mutate(actor,key,payload,n=>{const r={...payload,id:crypto.randomUUID(),owner:actor.id,reporter:actor.name,created_at:new Date().toISOString()};n.results.push(r);return r;});},
    export(actor){if(!actor.reviewer)throw fault(403,'仅测试负责人可导出');return {exported_at:new Date().toISOString(),...this.list(actor)};},
    close(){fs.closeSync(fd);fs.unlinkSync(lock);}
  };
}
module.exports={openStore,fault,sha};
