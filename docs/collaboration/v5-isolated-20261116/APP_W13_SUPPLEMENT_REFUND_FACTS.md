# W13 追加卡退款核定明细
仅修改 auditions/auditions_pages.dart 的现有追加卡及私有展示helper；不新增动作、路由或权限。

## 字段核实
auditions_models.dart:170–180 的SUPPLEMENT DTO保留data，但原有校验未检查refund_limit_minor/refund_reason。本轮不改DTO，在UI使用前明确校验：关联订单存在，limit为正int且不超过本追加amount_minor，reason为非空String且长度不超过2000。
后端auditions/supplements.js:8新建limit=0；:11独立AUDITION_SUPPORT核定时写入累计已退款+本次核定金额及理由，状态REFUND_REQUIRED；:15实际退款另检查分配及累计上限；:16后续financial更新保留核定字段。
因此label为“已记录的累计退款核定上限”，不能标为本次退款、余额或已到账。

## 呈现
有效字段显示上限和理由，明确包含此前已退金额；退款阶段但字段缺失或类型异常时显示明细暂不能确认。已付/待核付款及退款阶段显示“独立客服先核定，原付款另办理”边界；没有原始字段时不补0元或假理由。
不改变原状态标签、结算、独立订单入口、付款/退款动作、恢复或锁定。W15保持Web制作端分工，本轮不改。

## 核对与待验
仅静态检查变更；未测试、编译、格式化、提交或接口执行。同事待检查REFUND_REQUIRED/部分退/全退、limit=0、缺字段/错误类型、历史核定上限与原订单实际退款分别展示、大字长理由。此UI不证明支付渠道已退款。
