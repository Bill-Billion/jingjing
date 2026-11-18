# W19 投票对话框确认上下文防御

仅改 engagement_pages.dart 的 _EngagementState.vote。原对话框返回直接 act，缺少原身份和活动读取代际检查。本次进入前检查 mounted/enabled/checking/votingOpen，冻结身份 epoch、party、ticket、活动与候选 ID 及真实公开投影；返回后再次检查全部条件、活动投影及候选仍在同一活动且内容一致，才提交原 votes 请求。

后端 championship.js 的 competition 公开投影没有活动/候选 object_version。本次不虚构版本，以真实投影和读取代际绑定本地确认；不能保证未重新读取的服务器内容未变。实际资格、截止、余额、候选审核仍由服务端核验。当前 votingOpen 的开始/截止及剩余次数条件原样复用。

原 act、body 字段、key、pending 与未知结果恢复均未修改；不声称解决提名跨截止幂等问题。失效或离页不发新请求，需在当前页面重新确认。

仅源码、diff 静态复核，未运行测试、编译、分析器、格式化、浏览器或业务接口，未提交推送。待整批交付后同事验证：弹窗期间切身份/离页/重读、候选或规则变化、截止到时、待恢复请求出现，以及正常同上下文确认和原请求恢复。

源码 SHA256：`23fc7153d398f9ce7007989608cfe4765856a1dc3d59779df28a24879275d8f8`
