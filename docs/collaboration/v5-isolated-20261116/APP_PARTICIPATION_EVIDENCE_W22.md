# W22 本人参演与收入约定依据读取

## 实际改动
- projects/participation_pages.dart 在参演/收入约定详情加入“读取并保存本版约定依据”。仅该记录 owner_party_id 或 data.confirmers 的 party_id 匹配当前主体才显示按钮；不是用 account_id 匹配。busy、checking、未知原请求 recovery 时不可启动；下载不勾同意、不写会签、不生成阅读确认。
- projects/project_api.dart 新增专用 agreementEvidence，仅接受 PARTICIPATION / INCOME_AGREEMENT，只使用本记录唯一 evidence_asset_id。读取前后重读同记录，核对原 object_version、content_sha256 与证据ID及当前主体资格，不保存版本已变化的内容。
- 沿用 /api/v1/projects/records/:record_id/evidence/:asset_id；页面在打开保存前及返回后核 mounted/ticket/epoch/party/当前记录ID/version/hash。取消保存明确不当成功，网页只声明交浏览器核对。
- 原 ProjectsApi.evidence 的 owner-only 条件、SupplyApi.asset校验保持不变。本新增路径不要求参演方拥有出品方的供给素材元数据权限，也不开放任意文件。

## 已核契约
M/projects/release.js:23 对这两种约定特判 access，并限定本记录 evidence_asset_id；M/projects/repository.js:9 使用 confirmers.party_id（不是账号）。M/projects/checks.js:12核素材owner、READY、证据用途及隐私限制。H/projects-routes.js:47–49在服务器核私有存储字节长度/hash并二次校验授权。响应未向前端提供独立文件hash，本补丁不声称客户端另外做文件hash校验；本地比对的是约定内容hash与版本。

## 待同事核验
本人参演方、收入受益方、出品方及无权主体分别读同一记录；签署前/后和被限制证据；旧页面期间版本/身份改变；取消文件保存；结果未知会签恢复期间按钮停用。未测试、编译、分析器、格式化或运行业务请求；没有调整后端权限、会签body、原幂等恢复或通用项目owner门禁。

## 当前主体OWNER门槛补核
M/projects/repository.js:7 的 owner 查询明确要求当前账号是当前主体 ACTIVE 且 role_code=OWNER 的成员；:9 access在检查项目owner或confirmers.party_id之前先调用该 owner。release.js:23的参演/收入证据沿同一access。因此专用方法使用 ProjectsApi.owner()符合现有后端，不应为普通机构成员放宽。CommunityGate允许进入页面并不代表后台赋予普通成员本约定读取权限。这里的“当前主体OWNER”不等于“必须是项目出品方”：参演方/受益方自己的主体OWNER可在本版confirmers中获准读取；通用项目文件的fresh.owner限制仍未改变。
