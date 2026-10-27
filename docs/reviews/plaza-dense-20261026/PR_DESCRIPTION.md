# 合并申请正文准备稿

代码和全部报告已经上传到 `ux/plaza-dense-subpages-20261026`，目标 `integration`。GitHub 连接创建申请返回 403，尚未创建 PR；以下内容已准备好，恢复连接写权限后直接提交。

[打开申请准备入口](https://github.com/Bill-Billion/jingjing/compare/integration...ux/plaza-dense-subpages-20261026?expand=1)

建议标题：紧凑广场与子页面：更新原Figma、还原前端并联通现有接口

---

+主页的大海报、少量大头像及重复作品模块挤占了浏览区。本次按甲方确认的紧凑版更新原 Figma，并还原精选、艺人、视频、同城及相关二级流程：明星首区、四列/三列小像、唯一六格作品矩阵，保留当前 V5 导航、授权、许可、预约与单向投稿规则。

原 Figma 主页已原位替换，另补26份频道、子页和状态稿，保持原生可编辑文字与矢量。[原设计总览](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2169-2) · [修改、命名版本与节点记录](https://github.com/Bill-Billion/jingjing/blob/0cdba9b91417772bf94e1b868b40958c2cafb80c/docs/ux/plaza-dense-20261026/FIGMA_UPDATE.md)

- [问题与双方下一步报告](https://github.com/Bill-Billion/jingjing/blob/0cdba9b91417772bf94e1b868b40958c2cafb80c/docs/reviews/plaza-dense-20261026/REPORT.md)：已修前端与设计问题、剩余后端/产品事项分列。
- [接口核对](https://github.com/Bill-Billion/jingjing/blob/0cdba9b91417772bf94e1b868b40958c2cafb80c/docs/reviews/plaza-dense-20261026/API_REPORT.md) · [主页逐图验收](https://github.com/Bill-Billion/jingjing/blob/0cdba9b91417772bf94e1b868b40958c2cafb80c/docs/reviews/plaza-dense-20261026/VISUAL_HOME.md) · [子页逐图验收](https://github.com/Bill-Billion/jingjing/blob/0cdba9b91417772bf94e1b868b40958c2cafb80c/docs/reviews/plaza-dense-20261026/VISUAL_SUBPAGES.md)
- [26页图册源文件](https://github.com/Bill-Billion/jingjing/blob/0cdba9b91417772bf94e1b868b40958c2cafb80c/docs/ux/plaza-dense-20261026/index.html) · [逐项覆盖与实际截图来源](https://github.com/Bill-Billion/jingjing/blob/0cdba9b91417772bf94e1b868b40958c2cafb80c/docs/testing/plaza-dense-20261026/api/COVERAGE.md)

修复包括：试镜入口404及city丢失、身份/授权变化清除旧预览、空分页继续读取、412清除旧许可勾选、登录回跳保留上下文，以及详情字号/媒体高度、44px控件、投稿完整授权和同源图标。全部/搜索使用中性“入口”，避免将私人记录误标公开；试镜展示不承诺实时档期。

验证：[最终检查清单](https://github.com/Bill-Billion/jingjing/blob/0cdba9b91417772bf94e1b868b40958c2cafb80c/docs/testing/plaza-dense-20261026/CHECKS.json)中的普通与专用网页构建、CI范围Dart分析、597项实际Flutter测试通过，0跳过。320/390/768逐图验收；36组行为中35组自动通过，1组真实撤权保留原等待失败并以截图/请求链和只读HTTP复核；采纳755次真实HTTP及232张当前截图。另有82项只读接口检查、68项既有烟测及35项联合只读检查，未将这些次数相加冒充用户流程数量。

本次现有目录、详情、获准预览、原订单、通告投稿及试镜接口已联通。明星名单/排序、IP粗定位、城市编码/别名、主头像/缩略图及作品封面/精选字段仍需产品与Core约定，页面保留真实缺口状态；不使用概念照片或光环等级冒充接口数据。没有修改业务后端、迁移或统一契约。

测试仅限独立合成库：一个未付订单、三份待审投稿、一次本人撤权；受控409/412与真实后端结果分开记录。临时服务、随机库和凭据已清理，PR37独立甲方环境保留。真机、正式素材与真实付款另验。本侧自验不代同事实际审阅，本申请目标integration，未合入或部署。


远端补记：实现提交的[App与网页浏览器检查](https://github.com/Bill-Billion/jingjing/actions/runs/40387192023)、[接口与服务器检查](https://github.com/Bill-Billion/jingjing/actions/runs/40387191853)均成功。
