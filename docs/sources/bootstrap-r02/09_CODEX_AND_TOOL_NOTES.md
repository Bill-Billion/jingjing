# 工具使用依据与限制

本页只说明本次采用的工具约定；不改变项目需求。

## Codex指令加载

OpenAI官方说明，Codex会构建由全局、仓库根到当前目录的AGENTS指令链，同层AGENTS.override.md优先，指令合计存在默认大小限制。因此本包短AGENTS只放关键规则，详细业务用索引按需读取。已存在会话新增文件后，不假定自动重新加载；首条消息显式要求阅读，下一次在实际仓库工作时检查有效指令。

资料包位于工作区子目录，源码位于兄弟repo目录时，包内AGENTS不会自动成为repo的规则。首次报告先生成合并建议，经用户确认后放到仓库合适位置；不覆盖已存在规范或全局配置。

官方资料（2026-09-20查看）：
- https://developers.openai.com/codex/guides/agents-md/
- https://developers.openai.com/codex/windows/

## GitHub CLI

`gh auth status`检查本地登录，`gh repo view`验证具体仓库可见性，`gh repo clone <repo> <directory>`克隆到明确目录。不使用显示token的选项。网络/沙箱权限与GitHub仓库权限是不同问题，失败时按真实报错诊断，不让用户公开私有仓库来“解决”。

官方资料（2026-09-20查看）：
- https://cli.github.com/manual/gh_auth_status
- https://cli.github.com/manual/gh_repo_view
- https://cli.github.com/manual/gh_repo_clone

## 本包的现实边界

本次只核对来源与生成接手包，不代表已在用户Windows环境测试命令，不代表已连接GitHub或企业云账号。可执行校验脚本只使用Python标准库，不联网，不写业务数据。
