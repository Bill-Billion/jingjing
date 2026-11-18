# 会话风控与制作商单清分归档后端交接

接口0.31.63-rc.1，迁移0216/0217；后端负责人chengcongcong222。没有安排前端开发，Bill-Billion仍仅原UI。下列入口供阶段末复验和以后接续，不代表页面已接。

- `GET /api/v1/gigs/orders/{order_id}/conversation/message-risk`：当前独立GIG_REVIEW。
- `GET /api/v1/auditions/bookings/{record_id}/message-risk`：当前独立AUDITION_REVIEW。
- 两者只用账户会话，禁止X-Acting-Party，cursor须属于同一业务对象，limit 1—100。返回被拒请求的对象、发起账号、原因和时间，不含正文/请求指纹；Cache-Control no-store。普通参与方与已撤权人员无法读取。
- 原发送接口保留400 MESSAGE_REQUIRES_MODERATION。经当前会话权限/付款检查后才记录；审计记录独立提交后返回拒绝，事务中不能返回“审计成功”却丢记录。相同请求键原内容重复返回拒绝；改内容返回409 IDEMPOTENCY_CONFLICT。成功消息仍由原业务命令去重；旧接受命令不能借新拒绝记录改内容。存的是处理元数据，不是自动审核供应商结果，不新增无门槛私信。
- 本人原资料副本接口增加`section=MESSAGE_DECISIONS`，需同一申请包含PROFILE或ALL；只返回本人ALLOWED/REJECTED元数据，不返回指纹/正文，不自动完成申请；运营仍受原同申请权限约束。
- 制作商单归档只在新清分确认发生时核验：已批准财务协议及全部确认、DELIVERY_ACCEPTED条件、到清分时间、最新事实全额到账、独审清分及全部参与方确认、全部制作行已验收、无进行中退款/纠纷。最后确认和归档同事务；归档后可读历史，禁止新消息/RESUME，合同及下载权不随归档修改，没有创建实际付款。
- 未核实最终履约的其他服务继续原独立人工归档；已有历史清分不批量回填，若各方早于最终验收确认清分，本批未增加到期/验收后自动扫描。此项仍为局部收尾，不宣布所有清分场景关闭。实际打款、真实内容审核、设备通知和前端完整链另验。
