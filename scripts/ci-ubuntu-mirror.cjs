'use strict';
const fs=require('node:fs'),{spawnSync,execFileSync}=require('node:child_process');
// Recognized archive mirrors: https://launchpad.net/ubuntu/+archivemirrors
// Kernel.org provides an independently hosted fallback; apt trust stays Ubuntu.
const mirrors=['https://archive.ubuntu.com/ubuntu','https://azure.archive.ubuntu.com/ubuntu','http://azure.archive.ubuntu.com/ubuntu','https://mirrors.us.kernel.org/ubuntu'];
function selectMirror(suite,probe){
 if(!/^[a-z]+$/.test(suite||''))throw Error('UBUNTU_SUITE_REQUIRED');
 for(const mirror of mirrors)if(probe(mirror+'/dists/'+suite+'/InRelease'))return mirror;
 throw Error('NO_REACHABLE_OFFICIAL_UBUNTU_MIRROR');
}
function rewriteSources(text,mirror){
 if(!mirrors.includes(mirror))throw Error('UNRECOGNIZED_UBUNTU_MIRROR');
 // AWS-hosted GitHub runners use regional ec2.archive.ubuntu.com entries in
 // mirror+file lists. A successful probe is useless unless those entries move
 // too. Match complete apt URI tokens, never lookalike hosts or other paths.
 return text.replace(/(?<!\S)https?:\/\/(?:(?:azure\.archive|archive|security|[a-z0-9-]+\.ec2\.archive)\.ubuntu\.com|mirrors\.us\.kernel\.org)\/ubuntu\/?(?=\s|$)/g,mirror+'/');
}
function main(){
 if(process.platform!=='linux')throw Error('UBUNTU_RUNNER_REQUIRED');
 const release=fs.readFileSync('/etc/os-release','utf8'),suite=/^VERSION_CODENAME=(?:"([a-z]+)"|([a-z]+))$/m.exec(release);
 const mirror=selectMirror(suite?.[1]||suite?.[2],url=>{
  const r=spawnSync('curl',['--ipv4','--fail','--location','--silent','--show-error','--connect-timeout','5','--max-time','10','--output','/dev/null',url],{timeout:12000,stdio:'ignore'});
  console.log('Ubuntu mirror probe: '+new URL(url).origin+' '+(r.status===0?'reachable':'unavailable'));
  return r.status===0;
 });
 // Probe data is never installed or trusted. apt still validates Ubuntu's
 // signed indexes and package hashes using the runner's existing keyring.
 let rewritten=0;
 for(const file of ['/etc/apt/sources.list','/etc/apt/sources.list.d/ubuntu.sources','/etc/apt/apt-mirrors.txt','/etc/apt/apt-mirrors-security.txt']){
  if(!fs.existsSync(file))continue;
  const old=fs.readFileSync(file,'utf8'),next=rewriteSources(old,mirror);
  if(next!==old){
   execFileSync('sudo',['tee',file],{input:next,stdio:['pipe','ignore','inherit']});
   rewritten++;
  }
 }
 console.log('Ubuntu signed package source: '+mirror);
 console.log('Ubuntu source files rewritten: '+rewritten);
}
if(require.main===module){try{main()}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={selectMirror,rewriteSources};
