# 主页原稿校准：Figma 截图与检查

2026-10-23，Experience。用户要求以最早“先锋电影刊物”原稿重新校准 Figma，先完成主页，保留最新需求与现有业务流程。

[打开原稿、修改前和修改后对照](index.html) · [最终检查记录](FINAL_REVIEW.json) · [图片校验值](MANIFEST.json)

已通过本侧截图检查并原位更新：[广场主页](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2-69)、[视频频道](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2004-5895)。[Figma 对照区](https://www.figma.com/design/4W24XKo6ODW5JD8lBAyuDj/?node-id=2035-1752)保留修改前主页、四种城市/频道状态；修改前视频频道也独立存档。

|检查画面|结果与证据|
|---|---|
|原稿与在线修改前主页|[最早原稿](assets/earliest-reference.png)、[在线修改前](screenshots/figma-home-before.png)|
|默认城市两个频道|[艺人](screenshots/figma-home-artists.png)、[视频](screenshots/figma-home-videos.png)|
|已选上海两个频道|[艺人](screenshots/figma-home-artists-shanghai.png)、[视频](screenshots/figma-home-videos-shanghai.png)|
|城市浮层与长目录|[城市选择](screenshots/figma-home-city-picker.png)、[完整业务目录](screenshots/figma-home-business-directory.png)|
|窄屏设计预览|[320像素截图](screenshots/local-home-artists-320.png)、[几何与素材检查](local-320-check.json)|

恢复原稿的海边竖幅大图、72像素错位宋体、细线分隔、次级图文栏目及黑色续办条。五栏仍为广场、试镜、通告、消息、我的；城市和艺人/视频频道、故事创建与本人草稿，以及目录八个现有业务入口保持。照片是原稿影像示意，没有作为真实艺人或在售商品，也没有新增价格、付款或开工事实。

Figma 每种主页包含43个原生文本、29个组件实例及原生布局和矢量，内容图片只有286×420与154×84两处照片。没有把整页截图作为页面底图；原有15个全局变量保持不变。中文字体验证为 Noto Serif SC / Noto Sans SC，系统状态栏沿用原组件。

检查过程中实际修复了 WebP 导出不显示、缩放箭头色块、深层复制后导出回退默认文案，以及长目录标题宽度和箭头布局问题。照片无损转为PNG，箭头使用图标库源SVG，视频栏目采用明确默认文案，目录共享组件保留完整名称和说明。截图和最终结构都已复验。

需要更正此前判断：匿名分区截图没有加载照片；本次有权限读取的修改前主页本来已有大照片和错位标题。不能据此说旧Figma只参考了配色和字体。本次重新校准的是最早原稿的构图尺度、栏目和普通人的故事入口。

这是本侧设计验收，用户和另一位同事的人工审阅尚未进行。原文件原有原型连线为零，本次保留其行为，并提供城市/频道设计状态与现有App路径映射；没有宣称全流程可点击原型或业务接口联调通过。320像素检查来自本地设计预览，Figma主稿是390×844。

本次没有修改App、网页业务代码、接口、权限、订单、付款或授权规则。其余页面尚未按最早原稿重新校准；此前功能测试和截图不自动构成本次新视觉基准的验收。
