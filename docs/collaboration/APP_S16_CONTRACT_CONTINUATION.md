# S16 已有契约接入核对与展示补齐
基线本地HEAD fb4273877ca6474f8fe37be446e82af496b9cd85，后端目录无本轮未提交修改。未证明运行环境或远端服务与其一致。

## 后端已有能力
- src/modules/cocreation/delivery.js:16 snippetFile：owner及记录归属、APPROVED、本人参与ACTIVE、主单PAID、current.FINAL==accepted.FINAL==snippet.final_version_id、参与hash一致、文件READY及hash。
- state.js:9–17 validateMember复核所属人/活跃账号/素材/cast/coversConsent；:28 productionCheck复核房间READY无取消、人数与付款、逐参与人有效性。
- http/cocreation-routes.js:11在读取文件前后各调用snippetFile；校验长度/hash，no-store下载。已有契约，不能列为“后端无授权端点”。
- production/eligibility.js 与 licensing/repository.js:13–17还有关联生产/许可/binding检查。未证明每个隐私或撤权分支都覆盖，须同事做拒绝场景测试。

## 前端原已接通，本批只补真实字段
cocreation_pages.dart 原已有 savePrivate('snippets/{id}/file', hash:file_sha256)，只在APPROVED且enabled显示可点；保留，不新建接口、不绕字节/hash核验。
本批追加final_version_id、person_id、member_id、sharing_allowed原记录事实和原member页入口。明确这不是“当前全部门禁已通过”，原分享选择不是当前发布授权。不加分享按钮/假许可卡/假支付或验收状态。
共享savePrivate及API未改；拒绝/身份与恢复逻辑沿用。仅cocreation_pages.dart改动，库外备份及本地增量补丁。

## S10
wallet/policy.js:40–53 membership及repository.js:14–21 summary已有active/level/attained_level/valid_until/renewal_credit_minor/reason，基于SUCCEEDED充值与退款/成长/实名。
wallet_pages现已展示当前资格/有效期/续年进度并说明不是“本次刚恢复”。本批不改wallet。不伪造恢复日期或充值-恢复事件关联。

## S05
trade/policy.js:14付款证明没有FAILED/no_debit/safe_retry字段；repository.js:90 preparePayment已有同节点旧尝试全部CLOSED后重新核订单/金额/里程碑的准备能力，不能说没有重试能力。CLOSED不自动等未扣款失败；本批不改变付款。

## 验证边界
只读源码与本地diff核对，无测试、编译、analyzer、formatter、业务请求、提交、推送。需同事验证owner错误、撤销/过期授权、未付清、未验收、旧最终版、分享拒绝及下载前后撤权竞态。既有静态门禁不等已通过动态验证。
