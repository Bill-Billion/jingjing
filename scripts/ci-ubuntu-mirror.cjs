'use strict';
const fs=require('node:fs'),{spawnSync,execFileSync}=require('node:child_process');
const mirrors=['https://archive.ubuntu.com/ubuntu','https://azure.archive.ubuntu.com/ubuntu','http://azure.archive.ubuntu.com/ubuntu'];
function selectMirror(suite,probe){
 if(!/^[a-z]+$/.test(suite||''))throw Error('UBUNTU_SUITE_REQUIRED');
 for(const mirror of mirrors)if(probe(mirror+'/dists/'+suite+'/InRelease'))return mirror;
 throw Error('NO_REACHABLE_OFFICIAL_UBUNTU_MIRROR');
}
function rewriteSources(text,mirror){
 if(!mirrors.includes(mirror))throw Error('UNRECOGNIZED_UBUNTU_MIRROR');
 return text.replace(/https?:\/\/(?:azure\.archive|archive|security)\.ubuntu\.com\/ubuntu\/?/g,mirror+'/');
}
function main(){
 if(process.platform!=='linux')throw Error('UBUNTU_RUNNER_REQUIRED');
 const release=fs.readFileSync('/etc/os-release','utf8'),suite=/^VERSION_CODENAME=(?:"([a-z]+)"|([a-z]+))$/m.exec(release);
 const mirror=selectMirror(suite?.[1]||suite?.[2],url=>{
  const r=spawnSync('curl',['--fail','--location','--silent','--show-error','--connect-timeout','5','--max-time','10','--output','/dev/null',url],{timeout:12000,stdio:'ignore'});
  console.log('Ubuntu mirror probe: '+new URL(url).origin+' '+(r.status===0?'reachable':'unavailable'));
  return r.status===0;
 });
 // Probe data is never installed or trusted. apt still validates Ubuntu's
 // signed indexes and package hashes using the runner's existing keyring.
 for(const file of ['/etc/apt/sources.list','/etc/apt/sources.list.d/ubuntu.sources','/etc/apt/apt-mirrors.txt','/etc/apt/apt-mirrors-security.txt']){
  if(!fs.existsSync(file))continue;
  const old=fs.readFileSync(file,'utf8'),next=rewriteSources(old,mirror);
  if(next!==old)execFileSync('sudo',['tee',file],{input:next,stdio:['pipe','ignore','inherit']});
 }
 console.log('Ubuntu signed package source: '+mirror);
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={selectMirror,rewriteSources};
