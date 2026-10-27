const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {prepare}=require('./prepare.cjs');
const root=path.resolve(__dirname,'../..');
function run(access,{folder,port,origin,expires_at,campaign='client-free-20261026'}){
 const result=prepare([access],{folder,port,origin,campaign,durationMinutes:Math.min(4000,Math.floor((Date.parse(expires_at)-Date.now())/60000))});
 const file=path.join(root,result.config_file),config=JSON.parse(fs.readFileSync(file,'utf8'));
 const descriptions={buyer:'客户小晶 · 定制、购买、钱包与共创',artist:'艺人小夏 · 本人档案和授权',producer:'制作平台 · 受理、报价与交付',reviewer:'独立审核员 · 制作与权益审核',stock_buyer:'客户小林 · 已购视频和售后',stock_seller:'视频作者 · 现成视频管理',stock_reviewer:'视频审核员 · 权利与内容检查',notices_buyer:'通告发布人 · 查看报名和商单',notices_seller:'报名艺人 · 通告报名和约定',notices_reviewer:'通告审核员 · 报名与发布审核',auditions_buyer:'试镜客户 · 预约和服务验收',auditions_seller:'试镜艺人 · 接单与交付',auditions_reviewer:'试镜审核员 · 预约和交付审核',participant:'共创参与者 · 加入、授权与作品',mcn_owner:'机构负责人 · 艺人和员工管理',mcn_staff:'机构员工 · 本人获派业务'};
 const web=new Set(['producer','reviewer','stock_seller','stock_reviewer','notices_reviewer','auditions_reviewer','mcn_owner','mcn_staff']);
 const secretFile=path.join(root,'.local/client-feedback',campaign,'visitor-secret');
 if(!fs.existsSync(secretFile))fs.writeFileSync(secretFile,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
 const personas=Object.entries(descriptions).filter(([r])=>config.accounts['explore-'+r]).map(([role,title])=>({account:'explore-'+role,title,home:web.has(role)?'/workspace/workspace':'/app/#/square'}));
 config.builds.app=path.join(root,'晶晶日上工程交接包/01_源码/frontend_jingjingshangri_app/.local/explore-web');
 config.open_exploration={default_account:'explore-buyer',visitor_secret:fs.readFileSync(secretFile,'utf8'),personas};
 config.expires_at=new Date(Math.min(Date.parse(config.expires_at),Date.parse(expires_at))).toISOString();
 fs.writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});return {...result,personas:personas.length,expires_at:config.expires_at};
}
module.exports={run};if(require.main===module)console.log(JSON.stringify(run(process.argv[2],JSON.parse(process.argv[3]))));
