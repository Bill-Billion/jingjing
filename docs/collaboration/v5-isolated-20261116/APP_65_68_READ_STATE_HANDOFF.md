# 65 分页状态与68房间人选一致性

基线bcd9e546。两源文件完整差异已静态核对，写前备份与基线一致。

## 65
_ProjectsListState.load非more同时清rows/cursor，避免刷新失败后用旧游标跳读。加载更多仅error==null且cursor非空呈现；原重新读取可用，未改API和权限。
列表末尾业务草稿/发起制作需求两个原动作分别只创建一次；LayoutBuilder宽<340或14号字缩放>18时纵向stretch，其余原横排12间距。原busy/pending禁用与导航保留。未改列表行360阈值或猜测图卡几何。

## 68
load新增局部loadedPeople，邀请真人分页仅写局部变量；所有后续cases/members成功并通过原mounted/ticket检查后，people与room/member/cases/ownMembers一次setState提交。后续读取失败不再把新人选拼入旧房间；成功响应不含INVITE时人选清为空。
原API主体校验、CommunityPageState.fail明确撤权清私有、enabled含checking、草稿guard、pending/重放、真实允许动作均未改。没有清除用户草稿或扩大授权。

## 边界
本批不声称消除所有异步竞态：只修本次确证的人选提前回写；其余member草稿初始化/分页全链等不在本批范围。普通失败仍按既有错误呈现和旧记录策略，不冒充最新成功。
未测试、编译、格式化、业务请求或浏览器操作。待同事验证：有游标首屏刷新失败与重读、加载更多失败、小屏/大字双按钮；房间人选读成而cases/members失败、邀请权限变化、身份切换及原恢复流程。


## SHA256
projects/project_pages.dart: 8aee8a7ff6f44a3c85213c762bd9da5d7831ae965fdeabcf7e3808c78d674050
cocreation/cocreation_pages.dart: 4e410dfe36cea08aa2ca9585d75b809410de632ec84d56b882fa4299cb90f0d8
