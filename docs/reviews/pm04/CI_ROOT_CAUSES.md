# PM04 BE-01：CI 依赖失败归因与修复

2026-11-19，本侧 chengcongcong222；当前处于 G0 独立开发。规划见 [PM04 执行入口](../../pm04/README.md)，修复见 [草稿 PR42](https://github.com/Bill-Billion/jingjing/pull/42)。不改 App/Web 源码或业务断言，不合并、不部署。

## 原始失败与责任边界

输入 PR40 HEAD `0786030e88e905013c61e3d7e00c052c99301cde`；其 PR 检查实际 checkout 为 GitHub 合成提交 `6fcf1d137d687171ded39d62ffe31a69c46da3f9`，push 检查为原 HEAD。两者分别保留，不把 PR 合成提交当受测分支头。

|实际检查|原始结果|本轮归因|
|---|---|---|
|[PR 服务器 job134638327115](https://github.com/Bill-Billion/jingjing/actions/runs/44256189933/job/134638327115)|FFmpeg 安装 exit124；尚未启动数据库业务检查|BE-01：探测可用镜像后，区域镜像 URI 未被改写|
|[push 服务器 job134638430369](https://github.com/Bill-Billion/jingjing/actions/runs/44256182438/job/134638430369)|同类依赖准备 exit124|独立 push 证据同样出现未替换的区域 URI|
|[PR 管理网页 job134638326697](https://github.com/Bill-Billion/jingjing/actions/runs/44256189902/job/134638326697)|单元和构建成功；浏览器/FFmpeg 依赖准备 exit124|依赖失败发生在数据库及浏览器业务办理之前，不能报页面业务失败或通过|
|[PR App job134638327022](https://github.com/Bill-Billion/jingjing/actions/runs/44256189902/job/134638327022)|静态分析88项、exit2；后续测试/构建跳过|FE-02，由前端集中归因；不同于本地历史120条和74项测试失败|

服务器无需数据库的接口格式与权限规则检查成功，只证明该作业范围；原 G0 未通过。原始日志的时间戳节选和完整下载日志摘要见 [证据目录](evidence/PR40_LOG_INDEX.json)，完整解码日志保存在本机 `.local/ci-old-<job>.log`。

## 已证实原因和改动

原服务器日志 `07:06:19.3697841Z` 记录 `https://archive.ubuntu.com` 可达，而随后的 apt 下载仍访问 `http://us-east-2.ec2.archive.ubuntu.com/ubuntu`，最终 `07:12:45.7851388Z` exit124。旧脚本只识别 archive、azure、security 和 Kernel.org，未匹配运行器区域镜像。以原日志中的镜像列表内容构造测试，能够独立复现该遗漏。

修复源码 **`914aa43063d3f13367ff830d10cf20d12d466ee2`**：`scripts/ci-ubuntu-mirror.cjs` 覆盖 Ubuntu 区域镜像的完整 URI；保留白名单目标、原套件/组件/签名密钥，并输出实际改写文件数。不会改写相似域名、带凭据或查询参数的 URL、其他归档路径。不增加下载超时，不跳过工具验证、数据库、HTTP 契约或业务检查。

本地命令 `node --test scripts/ci-ubuntu-mirror.test.cjs`：

- 修复前新增3项均失败；完整6项为3通过/3失败，exit1，见 [修复前日志](evidence/mirror-before.log)。
- 修复后完整6项通过/0失败，exit0，见 [修复后日志](evidence/mirror-after.log)。

这证明匹配和保留规则正确，远端下载及业务结果仍必须看实际运行。本轮无 API、数据库迁移或产品业务修改，API `0.31.79-rc.1` / `0225` 共225项保持。

## 新候选实际运行

push 源码 `914aa43063d3f13367ff830d10cf20d12d466ee2` 已触发 [服务器检查](https://github.com/Bill-Billion/jingjing/actions/runs/44343915930) 和 [App/网页检查](https://github.com/Bill-Billion/jingjing/actions/runs/44343915804)。初次观察仍运行，不写成功。PR42 基于规划分支 `pm/**`，当前工作流的 PR 分支过滤未包含该基线，因此使用准确 push SHA 的检查；没有 PR 作业不算通过。

这是 BE-01 原有自动 CI 回归，不是 PM04 双方新候选已经整批交付后的联合验收。App 现存失败保留给 FE-02，后续其他失败按依赖、准备资料、业务行为分别归因；不因网页检查失败自动接管前端。

### 914aa430 的已观察结果

- 服务器 job134941044143 已通过依赖准备并启动数据库，完整业务检查尚在运行；无需数据库 job134941044838 已成功。
- [网页 job134941043251](https://github.com/Bill-Billion/jingjing/actions/runs/44343915804/job/134941043251) 的依赖准备已成功，日志确认实际改写1份源文件。浏览器 stage11 成功，随后短信登录检查在 `scripts/sms-login-browser-check.mjs:42` 失败：导航实际80项，旧断言79项，exit1。已完成源码定位，是前端导航/检查预期需核对，尚未验证80项是否全部应保留；不能简单加1制造通过。该脚本及其断言本侧未改，交 FE-02 集中处理。见 [远端节选](evidence/914aa430-web-excerpt.log)。
- [App job134941043673](https://github.com/Bill-Billion/jingjing/actions/runs/44343915804/job/134941043673) 仍静态分析88项、exit2；后续完整测试/构建跳过。

依赖阻断解除已有服务器/网页实际步骤证据，但整个 CI 和 G0 仍未通过。后续环境修复 `66272c93` 属 JT-03 夹具冷启动补丁，本机15组HTTP及同记录恢复通过，不能把914aa430远端运行称作该新提交的完整回归。
