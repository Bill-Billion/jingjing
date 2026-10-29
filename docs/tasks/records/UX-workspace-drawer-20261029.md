# 工作区入口抽屉与跨业务上传恢复 · 2026-10-29

> 后续纠正：用户明确要父子文件夹式分类。当前已由[功能树导航](UX-stock-media-tree-20261029.md)替代本页弹出抽屉；附件恢复修复继续保留。以下为本次历史记录。

前端负责人：Bill-Billion。用户要求收起过长的侧边栏入口。本次覆盖 Vue 共享导航及其 15 个业务页面；交付入口仍为 [PR39](https://github.com/Bill-Billion/jingjing/pull/39)。没有新增依赖或修改后端接口。

## 页面变化

- 默认只显示“工作区入口”、当前位置和身份区域；点击按钮从左侧展开抽屉，身份选择不用先打开菜单。
- 43 个通用入口和 11 个业务入口完整保留，可按名称搜索；搜索栏固定，长列表在抽屉内滚动。
- 点击入口自动收起；“收起”、Escape、遮罩均可关闭，焦点返回入口按钮。保留路由的草稿和待确认操作保护。
- 桌面和 390px 窄屏使用同一套交互，移除旧的手机折叠按钮，避免出现两层展开操作；沿用纸色、墨黑与朱红样式。

## 联调发现及修复

新抽屉检查覆盖从故事页切换到不同业务组件。旧恢复缓存监听将账号对象重新读取视为身份改变，因此暂离到艺人页再返回时丢失内存中的原上传请求；此前同一故事组件内返回列表的检查没有覆盖此路径。

在 `storyAttachmentRecovery` 将监听改为逐项比较 token、账号 ID、主体 ID 和会话修订号。同一账号的资料刷新保留恢复数据；真正退出或切换账号、主体、会话仍立即清空私有字节。已有测试新增“其他页面重新读取同一账号”的断言，修复前失败、修复后通过，并验证四种身份边界均会清空。

最终浏览器使用真实隔离接口、合成账号和 109 字节文本：注入一次未落盘失败 → 抽屉选择艺人页面 → 暂时离开 → 浏览器返回原故事 → 核对 → 恢复原请求 → 保存草稿。故事 `d2453341-b1dc-4cdb-8528-839cf2299caf` 的请求键前后均为 `77c04d93-c378-4b59-b629-3120de9fb480`；附件 `f7c32d0e-13fa-4864-a067-c437970e03b9` 由 UPLOADING 变为 READY，编号、字节数与摘要不变，记录数始终为 1。取消暂离也已验证，原请求不变。

## 验证与复现

在 `晶晶日上工程交接包/01_源码/frontend_ops_workspace` 执行 `npm test`：396 项通过；`npm run build`：类型检查和发布构建通过。已有大包超过 500 kB 提示仍存在，不是本次新增错误。App 未修改，本次未重复运行其测试。

1280×720 与 390×844 实际页面检查通过：默认收起、搜索及无结果、当前入口、收起按钮、Escape、遮罩、焦点恢复、列表内部滚动、窄屏无横向溢出。最终浏览器控制台无错误。检查完成后获取远端 a97112d5 并快进组合，其新增接口及后端不涉及 Vue 文件，本次前端受测源码未改变。

人工复核可从任意工作区页面打开入口，搜索并切换业务，再按 Escape 或点击遮罩收起；窄屏下确认只有一个展开按钮，身份仍在页面上。附件恢复须在隔离资料下使用一次写入失败，按上述路径切换、返回、恢复；不应刷新窗口或退出登录，这两种动作按说明清除内存文件。

证据：[结果汇总](../../testing/evidence/pr39-workspace-drawer-20261029/RESULTS.json)、[测试日志](../../testing/evidence/pr39-workspace-drawer-20261029/tests.log)、[构建日志](../../testing/evidence/pr39-workspace-drawer-20261029/build.log)、[收起桌面](../../testing/evidence/pr39-workspace-drawer-20261029/desktop-closed.png)、[展开桌面](../../testing/evidence/pr39-workspace-drawer-20261029/desktop-open.png)、[窄屏展开](../../testing/evidence/pr39-workspace-drawer-20261029/mobile-open.png)、[搜索结果](../../testing/evidence/pr39-workspace-drawer-20261029/search-result.png)、[内部滚动](../../testing/evidence/pr39-workspace-drawer-20261029/drawer-scroll.png)、[暂离保护](../../testing/evidence/pr39-workspace-drawer-20261029/pending-upload-guard.png)、[返回保留原请求](../../testing/evidence/pr39-workspace-drawer-20261029/cross-page-return-pending.png)、[恢复保存](../../testing/evidence/pr39-workspace-drawer-20261029/cross-page-restored.png)、[恢复前](../../testing/evidence/pr39-workspace-drawer-20261029/cross-page-before-recovery.json)、[恢复后](../../testing/evidence/pr39-workspace-drawer-20261029/cross-page-after-recovery.json)。

本批本地自验完成，上传及远端检查按 PR39 当前提交核对。未代队友审阅、未合入或部署。远端新增现货封面和时长接口已组合，页面接入仍属后续原任务；本次抽屉完成不代表 18 组和 151 条全部验收。

隔离测试已结束：本次随机数据库、临时凭据、预览和 API 均已清理，浏览器临时页已关闭，视口覆盖已复原；共享 MySQL 保留。见[清理记录](../../testing/evidence/pr39-workspace-drawer-20261029/CLEANUP.json)。协作材料检查与完整业务登记检查通过；后者不代表执行了 151 条产品验收。
