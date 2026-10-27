// Private local bytes for synthetic acceptance only; never a production storage adapter.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function openFiles(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});assert(fs.realpathSync(dir)===dir);
 const location=key=>{assert(typeof key==='string'&&key.length>0&&key.length<=1024);return path.join(dir,crypto.createHash('sha256').update(key).digest('hex')+'.bin');};
 const safe=file=>{if(fs.existsSync(file))assert(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());};
 return {async put({key,body}){assert(Buffer.isBuffer(body)&&body.length<=16*1024*1024);const file=location(key);safe(file);const tmp=file+'.'+crypto.randomUUID();fs.writeFileSync(tmp,body,{flag:'wx',mode:0o600});try{fs.renameSync(tmp,file);}finally{fs.rmSync(tmp,{force:true});}return {key,size:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex')};},async getBuffer(key){const file=location(key);safe(file);try{return fs.readFileSync(file);}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}};
}
module.exports={openFiles};
