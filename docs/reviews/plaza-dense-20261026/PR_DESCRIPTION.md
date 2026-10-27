# PR38：紧凑广场与子页面

[草稿PR38](https://github.com/Bill-Billion/jingjing/pull/38)已创建，目标`integration`，分支`ux/plaza-dense-subpages-20261026`。问题与验收入口已包含在申请说明中，同事实际审阅、合入与部署另行记录。

---

原主页的大海报、大头像和重复作品模块挤占浏览区。本次按甲方确认的紧凑版更新原 Figma，并还原精选、艺人、视频、同城及相关二级流程：明星首区、四列/三列小像、唯一六格作品矩阵，保留当前 V5 导航、授权、许可、预约和单向投稿规则。

原主页已原位替换，另补26份可编辑频道、子页和状态稿。[原 Figma 总览](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2169-2) · [设计更新与版本记录](https://github.com/Bill-Billion/jingjing/blob/ux/plaza-dense-subpages-20261026/docs/ux/plaza-dense-20261026/FIGMA_UPDATE.md)。

- [问题与双方下一步报告](https://github.com/Bill-Billion/jingjing/blob/ux/plaza-dense-subpages-20261026/docs/reviews/plaza-dense-20261026/REPORT.md)
- [接口报告](https://github.com/Bill-Billion/jingjing/blob/ux/plaza-dense-subpages-20261026/docs/reviews/plaza-dense-20261026/API_REPORT.md) · [主页逐图验收](https://github.com/Bill-Billion/jingjing/blob/ux/plaza-dense-subpages-20261026/docs/reviews/plaza-dense-20261026/VISUAL_HOME.md) · [子页逐图验收](https://github.com/Bill-Billion/jingjing/blob/ux/plaza-dense-subpages-20261026/docs/reviews/plaza-dense-20261026/VISUAL_SUBPAGES.md)
- [26页图册](https://github.com/Bill-Billion/jingjing/blob/ux/plaza-dense-subpages-20261026/docs/ux/plaza-dense-20261026/index.html) · [真实接口与截图覆盖](https://github.com/Bill-Billion/jingjing/blob/ux/plaza-dense-subpages-20261026/docs/testing/plaza-dense-20261026/api/COVERAGE.md)

前端修复包括：试镜入口404和城市参数丢失、身份/授权变化后清除旧预览、空分页继续读取、412清除旧报价与许可勾选、登录回跳保留上下文，以及详情字号/媒体高度、44px按钮、完整授权说明和同源图标。全部/搜索使用中性“入口”；试镜展示不承诺实时档期。

验证：597项实际Flutter测试、Dart分析、普通和专用网页构建通过；320/390/768逐图验收；36组行为、755次实际HTTP、232张当前截图。35组自动通过，1组真实撤权保留原等待失败并以截图/请求链和只读HTTP复核；受控409/412与真实接口结果分开记录。[本地检查](https://github.com/Bill-Billion/jingjing/blob/ux/plaza-dense-subpages-20261026/docs/testing/plaza-dense-20261026/CHECKS.json) · [前端远端检查](https://github.com/Bill-Billion/jingjing/actions/runs/40387192023) · [提交前服务器检查](https://github.com/Bill-Billion/jingjing/actions/runs/40389746521)。

现有目录、详情、获准预览、原订单、通告投稿及试镜接口已联通。明星名单/排序、IP粗定位、城市编码/别名、主头像/缩略图及作品封面/精选字段仍需产品与Core约定，已单列报告；未用概念照片或光环等级冒充业务数据。本轮未修改业务后端、迁移或统一契约。

测试限独立合成库，临时服务、随机库和凭据已清理；PR37甲方体验环境保留。真机、正式素材与真实付款另验。本侧自验不代同事实际审阅，目标integration，未合入或部署。
