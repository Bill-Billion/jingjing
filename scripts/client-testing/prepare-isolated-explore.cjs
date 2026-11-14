// Prepare one entry with separate synthetic business data for each browser.
// No account creation shortcut or provider configuration is exposed publicly.
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {run}=require('./prepare-explore.cjs');
const root=path.resolve(__dirname,'../..');
function prepareIsolated(accessFiles,options){
  assert(Array.isArray(accessFiles)&&accessFiles.length>=2&&accessFiles.length<=8);
  assert(new Set(accessFiles.map(f=>fs.realpathSync(f))).size===accessFiles.length);
  const results=accessFiles.map((file,i)=>run(file,{...options,folder:options.folder+'-seat-'+(i+1)}));
  const configs=results.map(r=>JSON.parse(fs.readFileSync(path.join(root,r.config_file),'utf8')));
  const config=configs[0],slots=[];
  const roles=config.open_exploration.personas.map(p=>p.account).sort();
  for(const [i,current]of configs.entries()){
    assert.deepEqual(current.open_exploration.personas.map(p=>p.account).sort(),roles);
    assert.deepEqual(current.build_manifest,config.build_manifest);
    const accounts={};
    for(const role of roles){
      const key=i===0?role:'seat'+(i+1)+'-'+role;
      if(i>0){assert(!config.accounts[key]);config.accounts[key]=current.accounts[role];}
      accounts[role]=key;
    }
    slots.push({id:'seat-'+(i+1),accounts});
  }
  config.fixture_files=[...new Set(configs.flatMap(c=>c.fixture_files))];
  config.expires_at=new Date(Math.min(...configs.map(c=>Date.parse(c.expires_at)))).toISOString();
  config.open_exploration.visitor_slots=slots;
  const dir=path.join(root,'.local',options.folder);fs.mkdirSync(dir,{recursive:true});
  const output=path.join(dir,'config.json');fs.writeFileSync(output,JSON.stringify(config,null,2),{flag:'wx',mode:0o600});
  return {config_file:path.relative(root,output),separate_browsers:slots.length,personas_per_browser:roles.length,expires_at:config.expires_at,public_access:false};
}
module.exports={prepareIsolated};
if(require.main===module){try{const plan=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(prepareIsolated(plan.access_files,plan.options)));}catch(e){console.error('隔离体验准备失败；请核对独立合成资料、构建与到期时间。私有配置未输出。');process.exitCode=1;}}
