# R03/R04 实际前端截图验收

本域选择 **44场景、154张最新适用截图、21幅直接或关联Figma原稿**。打开 `index.html` 可逐场景并排对照，`FINAL_SCREENSHOT_MANIFEST.json` 包含 `case / width / file / references / sourcebundlehash`，`VISUAL_REVIEW.json` 记录人工复核和已知差距。不能把关联参考、关闭态或多张滚动图计成额外独立设计页面，也不能据本域宣称103幅已全部逐像素还原。

- 最终静态与展开矩阵来自 `CAPTURE_ALL_FINAL_RESULTS.json` / `CAPTURE_ALL_EXPANDED_RESULTS.json`，构建 `af9c27d285f0eef48737069c6ab61c70ba0cce015530f3e2a8069c877645e51a`。
- 67/71四场景选用可播放色条补充 `CAPTURE_DELIVERY_PLAYABLE_FINAL_RESULTS.json`；4次预览GET200，真实readyState4、320×180、1秒、时间推进后按钮暂停成功。旧不可解码图完整保留作负向证据。
- 04–12/39十场景用最终白底底线主题 `CAPTURE_ALL_INPUTS_FINAL_RESULTS.json`（25图），构建 `d5fd658abda9162dabecf980b20eb5c1e6ca236099d506453c215cc309d00625`，原同场景图被新选集替换。
- 选集逐图查看，所有PNG及21幅原稿哈希重新核对；0写请求、JS异常、Flutter溢出、网络等待超时或滚动截断。未办理付款、验收、收讫、退款或原片下载。
- `CAPTURE_ALL_RESULTS.json` / `INITIAL_VISUAL_REVIEW.json` 与 `CAPTURE_DELIVERY_PLAYABLE_RESULTS.json` 是历史首轮结果；后者一秒色条在延迟采样时已结束，随后改为浏览器内记录播放瞬间，重跑通过。均不在最新选集。

缺图、字段不足、四步建档/组合创建、分类认证材料、统一作品库等问题详见 `docs/reviews/figma-frontend-restore-20261023/catalog-findings.md`。Figma含iOS系统状态区，本次为真实Flutter Web Chromium截图，未冒充移动真机。

当前源码仅作审核时快照，`sourcebundlehash` 是截图时HTTP取得的 main.dart.js 哈希。d5之后的输入底线显式零圆角、换角金额短标签/帮助文字及参演分期/履约标题隐藏内部键由主验收另做定点复拍；本选集不据此声称最后源码已有全量同源截图。
