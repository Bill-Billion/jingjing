# 队友与其Codex开始协作

已有仓库先保留自己的未提交修改；不要重新clone覆盖。先fetch，在独立worktree查看R0.6 integration，原main和个人分支继续保留。

```powershell
git status --short
git fetch origin
git branch -a
git worktree list
git worktree add -b ux/s0-001-toolchain ../jingjing-ux origin/integration
```

若任务分支已存在，使用该分支对应的worktree；若目录已存在，另选空路径，不删旧目录或重复创建同名分支。以上相对路径需从现有仓库执行。

进入新worktree后发送给队友Codex：

> 请按根AGENTS.md和docs/START_HERE.md接手Experience流。先核对实际branch/HEAD/dirty、origin/integration、R0.6、Stage、Task、REQ与contract版本，读取docs/status/EXPERIENCE_CURRENT.md及相关来源。用本人实际GitHub账号认领UX-S0-001并推送认领记录；Core-S0-001已由chengcongcong222认领。先完成Flutter工具链和旧页面到五入口映射，可同时准备Web骨架。服务端/主契约变更走CCR，普通UI无需逐项停等外部确认；共享边界须交叉review。不得直接push main、部署、调用付费服务或把测试stub当真实能力。

独立机器没有仓库时，可 `git clone --branch integration https://github.com/Bill-Billion/jingjing.git jingjing`，再从该目录建ux分支/worktree。鉴权用具备权限的账号，令牌不进入文件或聊天。

首次同步预期：R0.6原件、R0.3需求/设计/外部条件、V1/V2/V3来源、60项需求映射、双流状态、任务依赖和PR/CCR模板均在Git；不依赖本机Downloads或D盘路径。
