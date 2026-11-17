# W20 / W22 确认弹窗后上下文续补

保留上批 W19 投票和 W22 草稿失效改动，仅增加两个既有页面的确认后防御，不改后端或公共请求机制。

## W22 新约启用、退出
participation_pages.dart 增 confirmAgreementAction。进入及弹窗返回后核 mounted、enabled、checking、身份 epoch/party、读取 ticket、参演记录 id/version/hash、项目 id/version/hash，重新核当前出品方/退出当事人及原状态条件。启用还核存在 amendment。退出原因在弹窗前校验并冻结，不在返回后读取新文本。原 activation content_sha256、withdrawal reason、If-Match version 和 activation proof 保留。

## W20 撤回员工委托
engagement_pages.dart 原按钮冻结 epoch/party/ticket 及委托 id/version/hash。弹窗前后核 mounted、enabled、checking、owner 以及当前 staff 中仍有同版 ACTIVE 委托。仅以弹窗返回原因走原 revoke。_reasonDialog 全文件只有该调用，删除返回后写页面 reason controller，保留本地 controller 释放及返回值，避免离页或切身份后写旧控件。

## 边界与交接
未改变 act/body 字段/key/If-Match/pending 或未知恢复。服务端权限、截止、资金与版本核验仍为最终依据；本地绑定不保证未重读的服务器状态未变。失效确认不发新请求，需重新读取/确认。未声称修复跨截止幂等或运行复现越权。

仅源码与 diff 静态检查，未运行测试、编译、分析器、格式化、浏览器或业务 API，未提交推送。待集中交付后同事验证弹窗期间切身份/离页/重读/权限与状态变化、原 pending 恢复及正常路径。

本次冻结源码 SHA256：
- participation_pages.dart：`5d60e971fd19e1d97c65f04d5b1ec5aaac942117d98667193f8e2614a75a2627`
- engagement_pages.dart：`3f94164a769aedf9cf80ef1346d5393d402245e54d7e315ab3c395f12b67fb35`

上批专项文档 hash 为各批次当时快照，本续补 hash 覆盖本次累计源码。
