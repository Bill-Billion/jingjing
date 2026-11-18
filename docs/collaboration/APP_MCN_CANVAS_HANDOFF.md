# 42 MCN 合作原画布续批

## 依据与范围
原画布观察记录直接读取 Figma 4016:9309，54%：24px标题、本人确认/真实合作眉题、MCN深卡、真实期间/分成/范围、原协议与结束合作底栏。
仅改 lib/gigs/gig_pages.dart；不动 artists、engagement、production、API/models。原工作树及旧working未改。
库外备份 库外备份；增量 本地增量补丁。

## 真实App变更
- RELATION列表24px标题与独立深卡，每条仍独立显示真实状态、期间、分成；不把首条选为当前唯一有效关系。其它GIG/COMMISSION继续原tradeSection。
- 详情MCN真实显示名称/状态作为20px深卡，原主体编号及名称非实名提示保留。
- 原commission / marketplace_terms / v5_terms仍交原gigCommissionFacts呈现，单独分成区域，不写示例比例。原期间、排他、代管、原文及旧单handover入口保留。
- 末尾补所有权边界卡。真实END操作从正文移到吸底，仅原ACTIVE/INVITED显示，原busy/pending锁、decide原因对话框、版本/API均未改变。不伪称新的“申请解约”契约。
- 底栏“查看原合作约定”只读展示本次真实terms/分成/记录版本；不依赖可能未构建的滚动锚点，不提供签署操作。窄于340或大字时纵排。
- 原接受/拒绝本人条件、恢复请求、重读、受控证明下载、hash/版本及身份Gate保留。

## 局部差距
列表未有可靠当前关系聚合/名称批量字段，故保留多记录且名称只在已有relationNames详情显示。历史订单只在真实handover可用时进入，不虚构全量历史入口。
底栏查看的是原合作条款，不是独立电子签署协议或PDF。没有新增协议下载/客服/申请审批契约。
未做运行时、设备、像素及大字实机验收；只读取变更和原入口静态对照，不能称通过。

## 状态
未测试、未编译、未analyzer、未格式化、未提交、未推送、未部署。

源码 SHA256: 542ed400848bca543cf3ad171cee58e24e5d8be602e52acf1480660366d0a2b0
