"use strict";
const template=Object.freeze({title:'自由创作',description:'保存自己的创作草稿，正式提交后由平台受理；附件不会自动获得人物使用授权。',fields:[{key:'story',label:'故事或创作内容',type:'TEXT',required:true,max_length:12000},{key:'notes',label:'补充说明',type:'TEXT',required:false,max_length:2000},{key:'material',label:'私人参考附件',type:'PRIVATE_ATTACHMENT',required:false}]});
async function publish(repo,ctx,{template_version,source_ref,operation_key}){return repo.publishTemplate(ctx,{category_code:'free_creation',template_version,template_snapshot:template,source_ref,operation_key});}
module.exports={template,publish};
