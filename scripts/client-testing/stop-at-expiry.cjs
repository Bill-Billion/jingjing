// Stop only the exact retained test runtimes linked by this gateway configuration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),file=path.resolve(process.argv[2]);assert(file.startsWith(path.join(root,'.local')+path.sep));const c=JSON.parse(fs.readFileSync(file)),expiry=Date.parse(c.expires_at);assert(c.synthetic_only===true&&c.port===3490&&expiry>Date.now()&&expiry<=Date.now()+72*3600000);
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),files=c.fixture_files.map(f=>{const file=path.resolve(f);assert(file.startsWith(path.join(root,'.local/client-persistent')+path.sep)&&path.basename(file)==='access.json');return{file,hash:digest(file)};});
setTimeout(()=>{for(const{file,hash}of files)if(fs.existsSync(file)&&digest(file)===hash)fs.writeFileSync(path.join(path.dirname(file),'stop'),'Authorized test window ended; data preserved.');console.log('Owned synthetic runtimes requested to stop; data retained.');},expiry-Date.now()+1000);
console.log(JSON.stringify({expires_at:c.expires_at,runtimes:files.length}));
