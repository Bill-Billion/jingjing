# 广场四频道设计交付 · 2026-10-26

已通过 Figma 网页编辑原文件，未使用 Figma MCP。原「五个一级页面」中的精选主页已替换为本轮可编辑设计；新增「2026-10-26 · 广场频道审阅」页，集中展示四个频道、八个视图。

## 远端定位

| 内容 | Figma 节点 | 状态 |
| --- | --- | --- |
| 全部审阅 | [2102:3477](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2102-3477) | 四板总览 |
| 原页面中的精选首屏 | [2102:3169](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2102-3169) | 原生可编辑图层 |
| 精选双屏审阅板 | [2102:3476](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2102-3476) | 首屏审阅副本与下滑画板 |
| 精选下滑 | [2102:3263](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2102-3263) | 原生可编辑图层 |
| 艺人双屏 | [2102:3456](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2102-3456) | Image Gen 概念图，待审阅 |
| 视频双屏 | [2102:3459](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2102-3459) | Image Gen 概念图，待审阅 |
| 同城双屏 | [2102:3462](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2102-3462) | Image Gen 概念图，待审阅 |

原主页旧节点 `2:69` 在网页“粘贴并替换”后成为新节点 `2102:3169`，位置与 390×844 尺寸保持。交接时应使用新链接。原页面中的其他一级页面未修改。

## 已验证

- 版本历史中实际读回「2026-10-26｜广场内容推荐版修改前」和「2026-10-26｜精选主页更新＋三频道待审阅」，均已保存。
- 精选首屏与下滑内容通过 SVG 原生图层导入；文字、矢量图标、独立照片填充可分别编辑。SVG 来源共有 64 个文字节点、6 个照片槽位；没有将整张 UI 截图冒充可编辑页面。
- 实际选中品牌文字，属性面板显示 Noto Serif SC；品牌、封面主标题和主栏目标题已在 Figma 中校正为 Black。次级标题保留 Bold，正文使用 Noto Sans SC。
- 逐页查看首屏和下滑截图，核对照片裁切、标题、入口、底栏和遮挡；修正封面下方文字与图片交叠。
- 三频道概念图逐张查看，并在 Figma 中核对导入结果。三张图各含首屏与下滑两视图，均明确标注概念示意。

## 交付范围

人物、作品、活动名称和影像均为示意。三频道图是供审阅的栅格概念板，尚未转换为正式可编辑频道页面。后续制作需统一导航图标、字号与间距，并按原业务处理登录、预览、购买许可、通告投稿和试镜预约。

推荐内容来源、视频封面字段、未登录可见范围继续沿用 [PROPOSAL.md](PROPOSAL.md) 的待确认项。本轮未实施前端业务代码，也未更新 PR；未声称完成交互原型或业务接口验收。

## 文件

- [逐页审阅入口](index.html)
- [三个频道图与生成提示词](channels/README.md)
- [修改前首页](figma-evidence/featured-before.png)
- [精选首屏截图](figma-evidence/featured-after.png)
- [精选下滑截图](figma-evidence/featured-scroll-after.png)
- [Figma 总览证据](figma-evidence/figma-all-channels-review.jpg)
- [远端版本历史证据](figma-evidence/figma-saved-version.jpg)

`figma-native/` 保留可编辑导入源，`figma-assets/` 保留未改动的 Image Gen 摄影素材图；网页中的字重校正记录以本文件及 Figma 截图为准。
