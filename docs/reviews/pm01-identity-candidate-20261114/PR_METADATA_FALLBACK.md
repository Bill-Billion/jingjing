# PR 说明更新回执

本轮 GitHub 连接器的 update_pull_request 返回 HTTP 403 Resource not accessible by integration；没有将其当作更新成功。随后通过仓库已有 gh 认证执行 `gh pr edit 39 --title … --body-file .local/pr39-pm01-identity-candidate-body.md`，退出码 0。

再通过 gh 读取 PR 并逐项核对：准确候选 6905e22b44910e0b68191db0345fdebac99a892f、目标 integration/468df28a4159dfb09895827d86bfc817de259cc4、OPEN、草稿、标题及完整正文均符合预期，见 UPLOAD_OBSERVED.json。没有更改认证权限、目标分支、草稿或合入状态。此问题已向用户即时反馈。
