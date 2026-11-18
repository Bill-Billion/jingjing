# 通告授权修订历史：只读接入
基线2a810f4dbdab7fa226db29d3d4a1a4f7591419be。修改前已在仓库外备份既有四文件；新增notices_history.dart。增量补丁仅本地保留，不含预览或其他模块文件。
## 契约与边界
依据backend/src/http/notices-routes.js:23及modules/notices/revisions.js:73–88，补充APP_NOTICE_REVISION_CONTRACT_NEXT.md。GET history是{notice_id,current,items,next_cursor}，不是普通NoticeRecord/V5Page。发布者完整NOTICE_REVISION；投稿者仅APPROVED内容投影，不含作者审核人。服务端仍检查隐私与主体及关联投稿权限。
## 实际代码
- models：独立NoticeHistorySnapshot/NoticeRevisionItem/NoticeHistoryPage。双形态按可信source决定预期，完整记录校验kind/parent/owner/version/hash/status；投稿者严格投影字段集合与APPROVED，unexpected full shape失败。内容使用现有validateNotice。原修订nullable，未造时间/序号。
- API：先校验source.owner==当前owner；NOTICE需source.id==noticeId；SUBMISSION需parent_id与submission.notice_id都匹配；然后默认私有get，附cursor/limit20，无account:true或运营fallback。
- 路由/入口：/notices/history?noticeId&sourceRecordId；只在当前主体拥有的私有NOTICE或关联SUBMISSION详情显示。公开目录/公开详情不加入口。URL不传角色。
- 页面：V5Gate默认私有与过期态；每次含分页均重新读取source，源记录失败立即停止，无降级。每个await后mounted/ticket、epoch/party校验才回写。身份或权限改变清空；刷新清空；任何错误清空current/items/cursor。无成功结果不画空态。
- 分页：页内重复ID/next==previous拒绝，已读ID与已见cursor跨页去重；current的对象版本/修订ID/hash或可见范围变更时清空并要求重读，避免混版。按服务器编号顺序展示，绝不称时间顺序。
- 展示当前正文、历史正文、修订前快照、完整编号/hash；仅发布者显示修订说明和审核意见，不展示作者/审核人员标识。阅读不提交接受新版确认。
## 未做/待审
无新增POST/PATCH/确认/申请/修订写入或公开分享。没有自动调用acknowledgeRevision，也未把阅读当接受新版。当前无历史逐字段差异计算、发生日期或业务版本序号推断。
仅源码静态核对，未测试/编译/analyzer/formatter/运行App/业务请求/提交推送。交同事验证发布者与投稿者投影、伪造source关联拒绝、无关联/私有限制/身份过期、分页current变化、游标异常、失败清空与重试。均未验证。
## 冻结文件 SHA256
- notices/notices_models.dart: 145c9a17ba761c3adf5188afe1d026e9128a7a59842d7b759cb0893125f782a4
- notices/notices_api.dart: 4d3e9a4df1fc3585cfdfbcc9b9cac2818b9ddb45102bfeb395d96606352999aa
- notices/notices_pages.dart: 9507d0152d1c48cc739aebccd9b46abc64f93acfdc6c7051bb4292c2511b4509
- notices/notices_history.dart: 1462c8048f7ba3ad75a0699091a0a2a9606fc75f469f68dc65c104dfe96a1cb7
- app.dart: bc9323abca94b138598aa27d86906107fe64914981703487b4e548f5cf8e7eb7

## 源码静态补审修正
补直接import account/app_visual.dart以引用appNotice；修订前快照明确显示原标题，避免仅标题修改时丢失旧标题。未测试。
最新notices_history.dart SHA256: 1d8708f8d74b83469b11ed0c48fc034a923dc09a48844d98acbc72ea0f6e61d4
