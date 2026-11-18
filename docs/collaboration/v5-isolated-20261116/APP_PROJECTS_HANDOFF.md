# 65 我参与的故事：真实项目列表调整
2026-11-16。原稿依据来自主协调者同日 Chrome 63% 直接观察后提供的结构，不是本线程新增截图；按串行安排未打开浏览器。

## 改动
仅 lib/projects/project_pages.dart 的 _ProjectsList 页面和必要主题 import。修改前与 snapshot 完全相同。
实际 /projects/list 与 /my-projects 均绑定 ProjectsListPage；/projects/participation 是独立参演约定页。
- 28px“我参与的故事”和“从念头到自己的片尾”。
- 横向分来源入口：参与项目、制作任务、参演约定、业务草稿。明确不是跨业务全量筛选。
- 紧凑项目行：真实标题、object_version、状态、方案关联；项目范围保留在展开区，原项目进入动作不变。
- 底部并排查看业务草稿 / 发起制作需求，使用现有 /customization 与 /customization/new。
- 原身份门禁、分页、待确认恢复、项目详情及验收逻辑未改。新跳转在busy或待确认请求期间禁用。

## 未实现
无跨来源聚合接口，未仿造“我发起的/我参与的”筛选，不把当前页当全量。无真实封面契约，使用中性图标而非设计照片。未根据猜测状态直达审片/房间/合同，仍进入原项目核对当前权限。
account/business_library、API、models和其他页面未碰。未测试、编译、推送或合并，不能称65完整验收。
补丁 APP_PROJECTS_ISOLATED.patch 以snapshot为基线。
同事待测：不同身份读权限、分页与恢复、项目进入和各来源链接、窄屏并排按钮。仅待测清单。
