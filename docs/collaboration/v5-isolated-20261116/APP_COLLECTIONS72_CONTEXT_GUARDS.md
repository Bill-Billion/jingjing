# 72 收藏与足迹：整次读取上下文保护

## 已落实
- CollectionsApi.visit 在 preferences 返回后核起始 epoch，再按真实开关决定是否写浏览历史。保留原写入内容、版本、finally 清理及不重放策略。
- 列表 load 冻结起始 epoch、history/kind、ticket 与原分页 cursor；两次读取之间及列表返回后检查相同上下文。偏好和列表不因异步间隔换身份而拼成一次结果。
- 错误仅回写当前请求；finally 仍以 mounted/ticket 释放本请求 busy，不依赖成功后已变化的 cursor，避免锁住界面。
- me/collections 为个人接口，沿用 account:true 与 api.check(epoch, null)，不新增办事身份门槛。不改其他收藏、写入或结果未知恢复流程。

## 依据与边界
CommunityApi.read/write 原本已做每次请求身份检查，CommunityGate 也按 epoch/账号重建。本批补充跨两个 await 的整次请求关联，不声称原来毫无保护，也不是运行复现。

仅静态源码核对，未测试、编译、分析、格式化或调用业务接口。待同事验证：收藏/足迹切换、类型筛选、翻页、重读及身份变化时偏好与列表不混用；历史开关关闭不记录；旧任务不会清除新任务 busy；异常重试和原 pending 恢复。
