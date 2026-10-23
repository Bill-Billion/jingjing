# 其余Figma页面原稿对照与验收

2026-10-23，原文件 `4W24XKo6ODW5JD8lBAyuDj`，页面 `0:1`。本次使用正常Figma网页编辑，不使用MCP。

原有100幅逐页核对：44幅修正、56幅保留；新增1幅当前晶钻活动详情，最终节点为 `2064:2976`。此前广场与视频频道两幅单独交付，本包排除。新活动页曾用临时ID `2056:2906`，移至根级后重新导出，PNG逐字节相同，不重复计数。

打开[index.html](index.html)，可按板块和名称筛选，点击完整长图，逐页对照三张最早原稿。直接构图对应与视觉语言适配分别标明。每张联系表最多四幅，使用原始PNG像素；联系表只是排放证据，不改原图。

- `SCREEN_INVENTORY.json`：原102幅基线清单；`ADDED_SCREENS.json`：新增24A。
- `before/`：100幅原状截图；`after/`：45幅本次修正或新增后的原生导出。未修改56幅的当前证据直接引用原图，不能称为45幅以外的“修改后导出”。早期试镜、我的保留原390宽截图，其余大多为网页内置780宽2倍PNG。
- `REVIEWS.json`：最终逐页状态、原稿对应、实际改动、当前PNG、SHA及视觉/业务记录来源。原状发现和修正后结论分开保留。
- `QA_*.json`：本侧实际看图记录。原状视觉和业务各覆盖100幅；修改后视觉/业务各40幅，晶钻专项另5幅。静态检查不证明App、正式服务或完整交互。
- `WEB_EDITS.json`、`STRUCTURAL_EDITS.json`：原生文字及布局操作。编辑日志包含临时文字和图外开发说明，不以条数冒充不同页面数量。
- `WEB_EXPORTS.json`：实际网页导出历史，含中间版本及旧临时节点；当前有效截图以REVIEWS为准。
- `DISABLED_CONTROLS.json`、`ACTIVITY_DISABLED_CONTROLS.json`：7个关闭入口的外观与Prototype属性核对；`PROTOTYPE_CHECKS.json`：3条新增动作，未宣称运行验证或完整原型覆盖。
- `VERSION_HISTORY.json`与`web-proof/version-history.png`：校准前、复核稿及最终命名版本的网页保存核对。
- `MANIFEST.json`、`VALIDATION.json`：图片哈希、来源、结构与链接检查。它们本身不替代逐页看图。

图中人物、统计、金额和影像属于设计示例，不表示已经查得真实业务资料。当前无开放活动/目录是设计默认态，不能当作正式服务查询结果；已审活动、制作金、公示投票、付款、本人授权等仍由原业务控制。

Figma原生图层已更新。App、运营网页、后端和接口未改；用户及同事人工审阅尚未进行。证据保存在本地任务分支，没有据此更新GitHub PR或宣称远端自动检查通过。

重建图册：

```sh
/Users/yanghaoran/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 docs/testing/evidence/figma-remaining-calibration-20261023/build_gallery.py
python3 scripts/collaboration_check.py --render
python3 scripts/collaboration_check.py
```

执行目录为本工作树；图片与QA文件均已随包保存，不依赖登录态或MCP。原稿优先使用本包内文件，缺失时才查项目原始素材目录。
