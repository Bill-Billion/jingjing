# 02 试镜一级目录续批
依据原画布观察记录直接读4016:6849 87%。仅auditions_pages.dart的catalog分支与新增_catalogOffer展示helper；app_shell不改，避免01并发。
## 一级入口依据
app_shell.dart当前第379行对真实一级试镜tab使用AuditionsPage(embedded:true, initialCity:_city)，因此本批不是仅独立目录变化。未改登录门禁或其他tab。
## 已改
保留标题/我的试镜和说明；真实城市输入与查找横排，窄屏大字回退。没有地理距离/排名/综合筛选接口，不造四按钮。
真实方案卡120×180中性“未提供公开肖像”；右侧原方案title（不是虚构人物姓名）、城市/服务范围、真实OFFLINE/ONLINE_MATERIALS及返回slots数量。报价28px移到卡下方，与原约试镜按钮横排，大字回退。
原cityScope、公开/定向邀请条件、API读取分页、offerId/invitationId导航与权限保留。空结果提示增加error==null，失败不冒称没有方案。保留我的试镜/本人接单原入口。
## 缺口
AuditionOffer契约仅方案title、城市范围、模式、slots、公开价等，无可信公开肖像/姓名/认证/好评订单统计。没有插入设计人像、L2/4.9/订单数；已审方案标签不是人物认证等级。
本页未加载个人预约summary，不能造待赴约卡；我的试镜进度仍进入真实预约目录。没有新增跨域肖像API拼接或地理排序。
只静态读取源和模型契约，未测试/编译/analyzer/formatter/业务请求/commit/push。待同事核一级与独立目录、城市变更分页、定向邀请、价格隐藏、时段为空、窄屏大字及预约返回。
备份及本批patch：仓库外备份。
SHA256: 07c070383139767f0a6084f09c7d4127cf2ba5285c949f550d7d8df4c1e2cd4f

## slots文案补审
仅将“可约时段”计数改为“已公开时段”，并提示公开时段不代表实时剩余可约量、预约前重新核对。无数据/API/导航变化，无测试。备份：库外备份。
最新SHA256：d4c04f5b8d813fcdadf5b1be3a54ec7659128d44853a6798d38dbf165ae5a53a
