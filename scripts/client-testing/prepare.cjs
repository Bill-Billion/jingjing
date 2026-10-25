// Create a private invitation manifest from freshly running, isolated fixtures.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {sha}=require('./store.cjs');const root=path.resolve(__dirname,'../..');
const labels={buyer:'客户',outsider:'另一位客户',operator:'受理运营',merchant:'平台报价人',reviewer:'独立审核人',producer:'制作方',artist:'艺人本人',agency:'机构管理人',employee:'机构员工',moderator:'内容审核',finance:'财务审核'};
const groupNames={story:'故事与报价',artists:'艺人与数字人',delivery:'制作与交付',r05r12:'综合业务'};
function prepare(files,{port=3490,origin='http://127.0.0.1:3490',folder='client-session',campaign='acceptance'}={}){
 assert(/^[a-zA-Z0-9-]+$/.test(folder)&&/^[a-zA-Z0-9-]+$/.test(campaign));assert(Number.isSafeInteger(port)&&port>1024&&port<65536);
 const campaignDir=path.join(root,'.local','client-feedback',campaign);fs.mkdirSync(campaignDir,{recursive:true});const peopleFile=path.join(campaignDir,'people.json');const people=fs.existsSync(peopleFile)?JSON.parse(fs.readFileSync(peopleFile,'utf8')):{};
 const identity=(key,name)=>{if(!people[key])people[key]={id:crypto.randomUUID(),name,code:crypto.randomBytes(24).toString('base64url')};return people[key];};
 const accounts={},routes=[],invites=[],privateInvites=[],proofs=[];let expiry=Date.now()+55*60000;
 for(const input of files){const f=fs.realpathSync(input);assert(f.startsWith(fs.realpathSync(path.join(root,'.local'))+path.sep)&&path.basename(f)==='access.json');
   const parent=path.basename(path.dirname(f)),match=/^jx_test_(story|artists|delivery|r05r12)_\d+_[0-9a-f]{12}$/.exec(parent);assert(match,'仅接入已知隔离资料');const group=match[1];
   const data=JSON.parse(fs.readFileSync(f,'utf8')),statusFile=path.join(path.dirname(f),'status.json'),state=JSON.parse(fs.readFileSync(statusFile,'utf8'));
   assert(data.synthetic_only===true&&state.synthetic_only===true&&state.status==='RUNNING');assert(state.database===parent);assert(data.base_url===`http://127.0.0.1:${state.port}/api/v1`);
   expiry=Math.min(expiry,fs.statSync(statusFile).mtimeMs+state.expires_in_minutes*60000-60000);proofs.push(f);
   const keys=[];
   for(const [role,a]of Object.entries(data.accounts)){if(role.includes('outsider')||role==='minor'||role==='publisher'||role.includes('buyer2')||role.startsWith('co_actor_'))continue;const key=group+'-'+role;keys.push(key);assert(!accounts[key]);accounts[key]={...a,base_url:data.base_url,label:groupNames[group]+' / '+(labels[role]||({stock_seller:'现货卖方',stock_buyer:'现货买方',stock_reviewer:'现货审核',notices_seller:'通告发布方',notices_buyer:'通告报名方',notices_reviewer:'通告审核',auditions_seller:'试镜服务方',auditions_buyer:'试镜用户',auditions_reviewer:'试镜审核',participant:'共创参与者',mcn_owner:'机构管理人',mcn_staff:'机构员工'}[role])||role)};
     const name=accounts[key].label,{id,code}=identity(key,name);
     invites.push({id,name,reviewer:false,account:key,code_hash:sha(code)});privateInvites.push({name,account:key,code});
   }
   const add=(id,title,target,roles,instructions)=>{const allowed=roles.map(r=>group+'-'+r).filter(k=>keys.includes(k));if(allowed.length)routes.push({id:group+'-'+id,title,path:target,accounts:allowed,instructions});};
   const limit='仅使用合成测试资料；真实付款、签署、短信、数字人生成和外部存储不在本轮验收范围。';
   if(group==='story'){
     add('new','提交一份私人故事','/app/#/customization/new',['buyer'],'选择测试模板，填写虚构故事，保存草稿再提交。提交后记录编号，由受理运营在网页继续。'+limit);
     add('supplement','补资料与查看报价','/app/#/customization',['buyer'],'找到待补资料和待报价记录，查看要求、补充并提交；报价需独立审核后客户才能确认。'+limit);
     add('intake','运营受理故事','/workspace/operations/customization',['operator','merchant'],'找到客户提交的同一条故事，查看授权内容，受理或提出补充要求。'+limit);
     add('quote','报价及独立复核','/workspace/trade/quotes',['merchant'],'报价人办理已受理故事报价，审核人检查并独立复核；同一人不能代替双方确认。'+limit);
   add('review','独立复核故事报价','/workspace/trade/reviews/quotes',['reviewer'],'查看待审核报价和冻结的原故事，独立审核；不能代客户确认。'+limit);
   } else if(group==='artists'){
     add('own','本人档案与形象授权','/app/#/artists',['person','owner','artist'],'查看合成档案、形象及本人同意；核对机构代办不能代替本人授权。'+limit);
     add('manage','机构及艺人工作区','/workspace/artists/people',Object.keys(data.accounts),'只查看此测试身份被授权的档案；权限拒绝应按实际身份判断，不能直接算页面失败。'+limit);
   } else if(group==='delivery'){
     add('orders','原订单、付款与制作进度','/app/#/trade',['buyer','producer'],'查看原订单付款计划、原付款记录与对应制作项目；新建记录不代表实际付款。'+limit);
     add('production','制作交付工作台','/workspace/production/projects',Object.keys(data.accounts),'从本人有权访问的制作记录检查版本、反馈与交付门槛；本组部分媒体为占位字节，不验实际影像质量。'+limit);
   } else {
     for(const [id,title,target,instructions]of [
       ['stock','购买现成视频','/app/#/stock/catalog','浏览测试商品、查看购买记录与下载权限。'],
       ['notices','通告与报名','/app/#/notices','查找测试通告，查看条件及已有报名。'],
       ['wallet','钱包与晶钻','/app/#/wallet','核对模拟流水及未开放的真实充值入口。'],
       ['rewards','权益与抽奖','/app/#/redemption','检查测试活动、权益及库存提示，不代表真实奖品承诺。'],
       ['privacy','个人信息保护申请','/app/#/privacy?view=requests','提交虚构测试申请并查看进度，不上传真实个人材料。']])add(id,title,target,id==='stock'?['stock_buyer']:id==='notices'?['notices_buyer']:['buyer'],instructions+limit);
     add('workbench','运营与机构综合工作台','/workspace/workspace',Object.keys(data.accounts).filter(r=>r!=='buyer'&&r!=='outsider'),'按账号被授予的岗位查看菜单和业务；页面入口不代表具备所有权限。'+limit);
   }
 }
 assert(expiry>Date.now()+120000,'资料即将到期，请重新准备');
 const {id,code}=identity('feedback-reviewer','测试问题负责人');invites.push({id,name:'测试问题负责人',reviewer:true,code_hash:sha(code)});privateInvites.push({name:'测试问题负责人',account:'feedback-reviewer',code});
 const dir=path.join(root,'.local',folder);fs.mkdirSync(dir,{recursive:true});const src=path.join(root,'晶晶日上工程交接包/01_源码');
 const config={synthetic_only:true,version:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),origin,port,expires_at:new Date(expiry).toISOString(),data_dir:path.join(campaignDir,'records'),fixture_files:proofs,accounts,routes,invites,builds:{app:path.join(src,'frontend_jingjingshangri_app/.local/client-web'),workspace:path.join(src,'frontend_ops_workspace/.local/client-web')}};
 fs.writeFileSync(peopleFile,JSON.stringify(people,null,2),{mode:0o600});
 fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(config,null,2),{flag:'wx',mode:0o600});fs.writeFileSync(path.join(dir,'invitations.json'),JSON.stringify({origin,expires_at:config.expires_at,invites:privateInvites},null,2),{flag:'wx',mode:0o600});
 return {config_file:path.relative(root,path.join(dir,'config.json')),invitations_file:path.relative(root,path.join(dir,'invitations.json')),expires_at:config.expires_at,routes:routes.length,accounts:invites.length,public_access:false};
}
module.exports={prepare};if(require.main===module){try{assert(process.argv.length>2);console.log(JSON.stringify(prepare(process.argv.slice(2))));}catch(e){console.error('准备失败：请核对当前隔离资料与剩余时间；已存在的会话不会覆盖。');process.exitCode=1;}}
