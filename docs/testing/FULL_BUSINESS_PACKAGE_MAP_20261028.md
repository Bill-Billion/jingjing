# 30个交付包逐项对应（2026-10-28）

后端检查组通过仅证明覆盖到的行为，不等于工作包所有页面验收。源码入口位于工程交接包/01_源码的相应后端模块、App或网页。原始需求登记不覆盖；整链证据见主报告。

|原工作包|本次后端检查组|源码入口|当前结论|
|---|---|---|---|
|DEL-00 旧阶段归档、PR23合并与V5任务基线|governance|governance, docs/tasks|共同版本与任务记录已在；本批仍本地待审|
|DEL-01 账号、主体、成员与三端访问|account-api, party|account, account-api.js|身份切换及MCN跨端片段通过；三端完整权限矩阵待验|
|DEL-02 实名年龄、主角光环与认证收费|artists|artists|认证补件已有；真实实名及儿童处理未开放|
|DEL-03 多数字人、造型声音及基础创建托管|artists|artists, supply|档案、多形象和托管已有；真实长期建模未接|
|DEL-04 广场艺人目录、城市筛选与匹配|artists|artists, discovery|独立公开详情已补；主图、定位、明星及匹配未齐|
|DEL-05 艺人视频商品上架与内容运营|stock|stock, operations|首次上架、机构授权、退回修订仍阻断|
|DEL-06 现成视频的购买、许可和受控下载|stock|stock|购买下载售后已有，App播放收讫验收实测；首次供给整链待补|
|DEL-07 报价合同、各商品收银与退款恢复|trade|trade, participation|类型化收银退款补差已有；现金分期全页面整链待验|
|DEL-08 V5分账规则、历史订单与财务校验迁移|finance|finance, settlement-routes.js|账务及历史隔离回归；实际资金和跨端清分待验|
|DEL-09 真实试镜预约、到场取样与清分|auditions|auditions|预约会话到场补差已有；从零预约全程待验|
|DEL-10 六类通告与发布资格|notices|notices|六类和资格已有；逐类发布关闭矩阵待验|
|DEL-11 意向卡、反向投稿与客服转单|notices|notices|首次代投及新邀约已补；客服至成交整链待验|
|DEL-12 订单会话、通知与客服权限|gigs, operations|gigs, operations|商单消息实际发送；跨频道未读和批量已读未补|
|DEL-13 剧本商务供稿与运营入库|supply, licensing|works, licensing|商务入库及旧许可读取保留；非标受控阅读整链待验|
|DEL-14 定制品类与动态故事采集|customization|customization|动态故事补件及平台人工报价已有；故事接口21项|
|DEL-15 真人承制、报价里程碑与交付|customization-delivery, production|production, customization|交付接口29项；付款预览返修终验整链待验|
|DEL-16 多人共创、去重授权及10/20权益|cocreation|cocreation|10/20人、去重退出和额度已有；多人跨端待验|
|DEL-17 消费者储值与星探会员|wallet|wallet|模拟账户资格已有；真实托管未开，年度退款页面待验|
|DEL-18 晶钻、消费成长与积分事件账|wallet|wallet|事件账及待冲回已有；消费兑换退款整链待验|
|DEL-19 艺人六榜、买家城市榜及成长评价|engagement|engagement|六榜及冠军已有；配置前不排名，完整评选待验|
|DEL-20 一级推荐、7天归因及退款返佣|engagement, finance|engagement, finance|一级推荐与退款逆向已有；换绑旧单跨端待验|
|DEL-21 晶钻抽奖、十连保底及概率发布|engagement, redemption|engagement, redemption|App抽奖到记录实测；十连库存兑奖整链待验|
|DEL-22 固定兑换、卡券制作金与中奖权益兑现|redemption|redemption|全额权益下单取消实测；消费来源和退款待验|
|DEL-23 个人信息权利、青少年与消费保护|privacy|privacy|展示名确认已补；可读删除范围及正式保留依据欠缺|
|DEL-24 私有素材、内容审核与AI标识全链|media, providers|media, providers|媒体处理15项通过；OSS真实审核与素材质量另验|
|DEL-25 MCN独立PC经营与个人轻操作|engagement, artists|engagement, artists|机构安排和员工接受同记录实测；解绑退款待验|
|DEL-26 运营CMS总工作台与规则发布|operations, governance|operations, governance|岗位待办配置审计已有；配置发布全矩阵待验|
|DEL-27 非标参演、项目发行与收入凭证|participation, projects|participation, projects|三方确认到未付款及收入确认实测；改约发行结算待验|
|DEL-28 五Tab迁移、原型缺陷与视觉接线|account-api|app.dart, app_shell, discovery|最新五栏保持；全App912项含历史兼容，不是全部页面验收|
|DEL-29 集成验收、迁移恢复与发布证据|release, mysql, worker|infrastructure, scripts|隔离回归恢复已有；旧库样本真机弱网正式放行仍欠|
