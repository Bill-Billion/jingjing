# W19 / W20 原请求回执绑定

## 范围
仅 engagement_pages.dart，四个首次提交调用点和对应恢复路径：votes、appeals、mcn/staff、新委托撤回 mcn/staff/{id}/revoke。未改其他派单、12/45 UI、共享 savePrivate 或 API。

## 实际防护
actBound 深复制提交 body 并冻结 suffix/version/party 后交原 act；专用 validator 在原 pending 消费前校验。恢复进入时从 recoverySuffix、原 recovery.body/version 与当前已选身份创建冻结 validator，super.recover 仍原样恢复同编号请求，不重建请求、不从当前表单或列表取旧依据。
- 投票：VOTE、原身份、原活动 parent、原候选、VALID 历史成功快照、合法正晶钻数（规则上限100000）及 hold_id。
- 异议：APPEAL、原身份、原活动、原 reason、OPEN 历史成功快照。
- 撤回员工委托：STAFF_GRANT、原路径 id、原身份、null parent、REVOKED、原版本+1、原 reason。
- 新员工委托：STAFF_GRANT、原身份、null parent、ACTIVE、原 account_id、非空无重复 person_ids/actions 合法集合，人员上限100；actions 沿后端七项白名单；valid_until 按同一时刻比较。
原 communityRecord 的记录结构与内容 hash 校验保留。关联不匹配使用 communityRequire 的 uncertain 错误，原 pending 保留，不能把响应当成功后重新下单或扣分。

## 后端依据及历史语义
backend_server/src/modules/engagement/championship.js:15/17 为 VOTE/APPEAL 创建回执；mcn.js:3/31/32 为 action 白名单、STAFF_GRANT 及撤回；context.js:32–41 的 save 版本+1，command 幂等重放存储 result_json 原快照，不读取当前状态。artists/policy.js:6 要求非空、无重复数组。
因此恢复校验不要求当前榜单、当前员工授权、当前规则价格或当前对象版本与历史回执相同。API 的身份上下文检查及原 owner 门槛不变。

## 静态核对与未验证边界
修改前已库外备份；阅读新增 validator 与完整四处调用 diff，核对后端原返回与幂等实现。首次和恢复均在 AccountApi 验证后消费 pending 的位置生效。未测试、编译、analyzer、格式化或推送，不声称后端曾实际错发回执，也不声称运行通过。
同事待测：四动作正常回执、错活动/候选/owner/id/原因/版本拒绝且 pending 保留；员工集合顺序变化及时间等价；操作完成后记录状态变化再重放仍接受原成功快照；身份变化仍由原 API 门槛拒绝。其他 MCN 派单未核未改。

冻结 engagement_pages.dart SHA-256：`a1aebee4f2975918786ce05b93c03737fecb589a6b20d9df7d57bd4d90c21a67`
