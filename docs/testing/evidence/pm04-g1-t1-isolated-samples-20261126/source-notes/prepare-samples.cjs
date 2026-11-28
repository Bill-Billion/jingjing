// Client supplied samples: originals stay outside Git; bounded, visibly labelled copies only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function prepare(source,ffmpeg){
 const dir=path.join(root,'.local/client-samples');fs.mkdirSync(dir,{recursive:true});
 const portrait=path.join(dir,'test-portrait.jpg');if(!fs.existsSync(portrait))execFileSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0xbcc8ce:s=360x640','-vf',"drawtext=text='SYNTHETIC PERSON':fontcolor=black:fontsize=26:x=(w-tw)/2:y=h/2",'-frames:v','1','-update','1',portrait],{stdio:'pipe'});
 const names=fs.readdirSync(source).filter(n=>/^[a-f0-9]{31,32}\.mp4$/.test(n)).sort();if(names.length!==3)throw Error('Expected the three supplied sample videos');
 const rows=[];
 for(const [i,name] of names.entries()){
  const original=path.join(source,name),hash=crypto.createHash('sha256').update(fs.readFileSync(original)).digest('hex');
  const row={id:'sample-'+(i+1),source_filename:name,source_sha256:hash,rights:'Client supplied for acceptance testing; no sale or likeness license inferred',files:{}};
  for(const kind of ['full','preview']){
   const file=path.join(dir,`sample-${i+1}-${kind}.mp4`);
   if(!fs.existsSync(file))execFileSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-i',original,'-t',kind==='preview'?'20':'91','-vf',`scale=360:-2,drawtext=text='TEST ONLY - ${kind.toUpperCase()}':fontcolor=white:fontsize=20:box=1:boxcolor=black@0.6:x=(w-tw)/2:y=h-60`,'-c:v','libx264','-preset','fast','-crf','28','-c:a','aac','-b:a','64k','-movflags','+faststart',file],{stdio:'pipe'});
   const b=fs.readFileSync(file);if(b.length>16*1024*1024||b.toString('ascii',4,8)!=='ftyp')throw Error('Invalid sample copy');row.files[kind]={filename:path.basename(file),size:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};
  }rows.push(row);
 }
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({test_only:true,samples:rows},null,2));return rows.map(r=>({id:r.id,files:r.files}));
}
module.exports={prepare};if(require.main===module)console.log(JSON.stringify(prepare(process.argv[2],process.argv[3])));
