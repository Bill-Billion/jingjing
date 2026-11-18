# W16/W17 兑换与抽取弹窗上下文绑定

仅改 redemption_pages.dart 原兑换与单抽/十连按钮回调，保留 23/24A 布局及既有恢复机制。

兑换弹窗前冻结身份 epoch/party、读取 ticket、stock_id、template_sha256、扣分和实际目录条目 JSON 投影。前后均核 mounted/enabled/!checking，当前 rows 仍含同条目同投影且本次读取库存为正。以冻结 id/hash 走原 exchanges body。

抽取弹窗前冻结身份、读取代际、pool_id、rules_sha256、所选次数对应扣分及真实奖池投影。count 是当前 for-final 回调的固定值。前后核 mounted/enabled/!checking/agreed、当前 detail 同奖池同规则同投影，返回时重新计算 lotteryAvailability，才走原 draws body。完整投影比对包含已显示金额与规则，无虚构 object_version。

所有判断仅绑定本地读到的确认内容，不保证服务器库存/资格仍可用。后台权限、资格、余额、截止和库存校验不变。原 body 字段、act、key、pending、未知结果恢复、结果处理及失败公示重读均保留，不改锁券/释放/排期确认。

仅静态源码与 diff 检查，未测试、编译、分析器、格式化、浏览器或业务接口调用，未提交推送。待集中交付后同事验证弹窗期间切身份/离页/重读/规则金额变化/截止到时，以及正常同上下文提交与原 pending 恢复。

源码 SHA256：`5aa0b1f7b5e43b674f617c54271757eafd56f70bf5f14b789205a338da152776`
