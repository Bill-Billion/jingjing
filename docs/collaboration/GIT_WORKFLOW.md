# Git协作与认领

远端：`https://github.com/Bill-Billion/jingjing.git`。`main <- integration <- core/<task> / ux/<task>`。不同Codex使用不同worktree。

每次先 `git status --short`、`git branch --show-current`、`git rev-parse HEAD`，再 `git fetch origin`，读取origin/integration及当前任务分支。脏工作区先保留，不用reset --hard/clean/强推处理。

1. 从origin/integration创建自己任务分支/worktree；同一分支不在两处同时工作。
2. 查board.json及远端双方任务分支有无认领；更新自己任务owner/status/branch和本流CURRENT，commit/push。认领提交先集成到integration以减少重复开工；有冲突暂停该任务并协调归属，可做无关任务。不要整份覆盖对方的board。
3. Task可持续commit/push自己分支；完成自验后提交PR到integration，带Task/REQ、改动、验证、兼容恢复和共享边界。共享边界由另一流留下真实review后集成；不能由同一Codex假扮另一reviewer。
4. 普通内部实现自验后可进入integration。合入前fetch，确认最新基线，解决冲突、复验受影响部分；使用保留历史的普通merge/快进，不强推公共分支。
5. 更新board的实现状态、证据和CURRENT。合并结果以实际提交/PR为准，不在提交前写“已推送/已合入”。文档初始化可通过实际git log与remote引用核对。
6. CP通过后由维护者把integration送入main；Codex不直接push main，不因Stage结束自动部署。

建议维护者为main配置禁止直推/评审检查，为integration配置相应检查；**本次未更改GitHub分支保护，文档规范不等于服务端已强制**。也未安装hooks或改用户全局Git/Codex设置。

状态：READY/PLANNED → CLAIMED → IN_PROGRESS → IN_REVIEW（共享边界）→ DONE；BLOCKED需写具体依赖。任务Done只证明所列验收，不代表相关REQ全部完成或Provider生产可用。
