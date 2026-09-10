const fs=require('fs');
const f='C:/Users/user/Doubao/chats/2026-08-24/new-chat-3/work/server/server/.env.example';
let t=fs.readFileSync(f,'utf8');
if(t.includes('ALIYUN_ACCESS_KEY_ID')){console.log('already present');process.exit(0);}
if(!t.endsWith('\n'))t+='\n';
t+=`
# ===== 阿里云 实人认证 + 内容安全2.0（V12.5；缺任一凭证自动安全降级，不填不影响现有功能）=====
# RAM 子账号 AccessKey（建议仅授予 AliyunCloudauthFullAccess + AliyunYundunGreenFullAccess 最小权限）
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_REGION=cn-shanghai
# 实人认证 cloudauth：控制台「实人认证→认证方案」创建后得到的数值型场景ID（要素核验/人脸核身各一个）
CLOUDAUTH_ENDPOINT=cloudauth.aliyuncs.com
CLOUDAUTH_REGION=cn-shanghai
CLOUDAUTH_ELEMENT_SCENE_ID=
CLOUDAUTH_FACE_SCENE_ID=
# 人脸核身相似度通过阈值（0-100，默认80）
CLOUDAUTH_FACE_PASS_SCORE=80
# 内容安全2.0 green：service 场景名以控制台已开通为准（可按实际开通场景覆盖）
GREEN_ENDPOINT=green-cip.cn-shanghai.aliyuncs.com
GREEN_REGION=cn-shanghai
GREEN_TEXT_SERVICE=comment_detection
GREEN_IMAGE_SERVICE=baselineCheck
GREEN_VIDEO_SERVICE=videoDetection
# 云机审总开关：有 ALIYUN AK 即用云；如要强制走本地词库+人工，把 MODERATION_ENABLED 设为 false
MODERATION_ENABLED=true
# 兼容旧键（一般不用，优先 ALIYUN_ACCESS_KEY_*）：MODERATION_PROVIDER=aliyun / MODERATION_API_KEY / MODERATION_API_SECRET
`;
fs.writeFileSync(f,t,'utf8');
console.log('appended, new len',t.length);
