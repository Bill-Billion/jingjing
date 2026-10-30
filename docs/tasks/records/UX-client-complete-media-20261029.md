# PR39：主肖像、媒体分类、附件保留与上传恢复

2026-10-29，前端负责人 Bill-Billion 基于 PR39 的 `7882a98648bf339d999f61c40c8d47084d725433` 接入后端 `0.31.4-rc.1`，沿用数据库迁移 `0167`。后端负责人仍为 chengcongcong222。本批是原第5、15组的前端增量，不新增需求组，也不代表18组或151条标准已全部验收。代码、证据和本记录集中交付原 PR39；上传及远端检查以申请当前提交为准。

## 用户现在能完成什么

- App 和网页申请公开展示时，可明确选择本次预览材料中的 JPEG／PNG 作为主肖像，也可留空。不会默认把第一份附件当头像。更换仍提交新的展示申请，待审不提前公开；原已审展示在新申请通过前继续有效。
- 公开详情按服务端媒体清单区分图片、声音、视频和文件。图片实际解码，声音／视频使用相应播放器，文件提供受控下载。按账号读取公开资料，不带办理机构头；核对文件编号、类型、大小及摘要。读取失败、资料撤回、身份变更和迟到响应均清理失效内容及对象 URL。
- 故事附件清单主动请求 `include_retention=true`，识别可选的 `retention_reason: FORMAL_SUBMISSION`。历史正式版本引用过的旧附件，即使不是当前引用，也显示保留提示并禁止撤回；未正式引用的新补件不误标保留。不推测保留年限，也不称文件已永久删除。
- 继续使用原上传恢复机制。App 提示改为“核对并恢复原上传”，保留原文件、摘要和请求键；不因存储暂未写入而另建记录。网页原核对及恢复入口保持兼容；待核对时暂离改用页内确认，按钮明确为“继续核对”和“暂时离开”，默认聚焦继续核对，Escape取消。

只有提交展示权限、没有材料管理权限的机构，不能读取私人文件元信息；页面说明须由本人或有材料管理权限者选择肖像，允许留空提交。主肖像选择不扩大原授权。声音版本为空表示“未指定声音版本”，不等于本次公开预览中不能含声音文件。

## 本机验证

|检查|实际结果|
|---|---|
|App 仓库 CI 指定测试范围|684 项通过，0失败，含本批媒体、肖像、附件保留和原请求恢复检查；子集不重复加总|
|App 静态分析|362 个 Dart 源码／测试文件与 ASCII 分析镜像逐字节一致；`flutter analyze --no-pub` 无问题。镜像用于避开本机中文路径分析服务故障|
|App Web 构建|普通入口发布构建、现有合成身份测试入口发布构建均通过；未执行 Android／iOS 真机验收|
|Vue 完整回归|396 项通过，0失败，含39项艺人检查、67项故事相关检查及82项通用业务检查；新增暂离确认／身份变化两项回归|
|Vue 静态及构建|`vue-tsc --build`、Vite 发布构建通过；保留既有大分包提示|
|既有账号协议桩|启动仓库的本机桩后112项通过；首次未启动3210服务的连接失败已排除，不计作真实后端联调|
|窄屏|网页公开媒体及暂离确认在390px视窗下页面宽度390px，无横向溢出；确认按钮完整可见|

App 测试使用 `.github/workflows/pr11-frontend-checks.yml` 中现有 `flutter test test/account ...` 完整范围；Vue 在 `frontend_ops_workspace` 运行 `npm test`、`npm run build`。本次未重跑后端949项综合检查，该数字属于后端原记录。`collaboration_check.py`、`full_business_check.py` 及其19项反例测试均通过；登记检查不等于业务验收，本批不修改151条正式验收状态。

## 同记录实际办理与证据

### 选择、待审、审核、展示、撤回

App 为同一合成艺人上传两张PNG、一份WAV、一份MP4和一份TXT，明确选第二张图片 `3816c8c2-bae9-49c7-b121-a3c40852f871`，建立展示 `22102010-a9d5-4991-b57f-c2c2867f6d8e`。待审时公开媒体返回404。网页独立审核账号核对这5份材料并通过后，两端均显示所选第二张图；WAV与MP4实际播放，视频320×180、时长1秒。该时长来自本次已加载播放器，不作为后端目录时长字段。

网页随后建立替代展示 `44525354-f0b9-4ceb-a648-cac8c6246324`，另选第一张PNG。选择列表只有两张PNG，声音／视频／文档不作为候选。待审时旧展示仍返回200且保持旧肖像，新展示404；独立审核通过后新肖像生效，旧展示撤回。最后通过 App 撤回新展示，两端再次读取后均移除图片／播放器／旧对象链接，公开媒体返回404。没有声称能远程删除用户已下载的文件。

证据：[App主肖像选择](../../testing/evidence/pr39-media-20261029/app-primary-choice.png)、[网页主肖像选择](../../testing/evidence/pr39-media-20261029/web-primary-choice.png)、[App播放](../../testing/evidence/pr39-media-20261029/app-media-player.png)、[网页播放](../../testing/evidence/pr39-media-20261029/web-media-player.png)、[播放器状态](../../testing/evidence/pr39-media-20261029/web-playback.json)、[390px页面](../../testing/evidence/pr39-media-20261029/web-media-narrow.png)、[待审拒绝](../../testing/evidence/pr39-media-20261029/pending-access.json)、[更换待审隔离](../../testing/evidence/pr39-media-20261029/replacement-pending.json)、[网页撤回后清理](../../testing/evidence/pr39-media-20261029/web-withdrawn-cleared.png)、[App撤回后清理](../../testing/evidence/pr39-media-20261029/app-withdrawn.png)。

### 原文件未落盘后的恢复与历史保留

App 从正常入口新建故事 `cfed5558-a001-4b25-b05a-8019d7ac1ad5`。隔离存储仅对下一次故事文件写入注入一次失败，附件 `a082646a-86c7-45c7-a3ed-d712ebb1b957` 已预留为 `UPLOADING`，原文件未写入。点击“核对并恢复原上传”后，同一附件变为 `READY`；编号、109字节、SHA-256保持一致，记录数始终为1。随后保存引用并正式提交成功。

运营在同一故事提出补件要求，App 上传79字节替换文件 `557dfeea-3753-4e05-b7e0-f24fbe9d663b` 并保存草稿。旧正式附件有保留提示且不能撤回，新草稿附件仍可撤回。网页本人接续同一故事，填写补件说明、保存并明确正式重提。两端重新完整打开后，即使未加载历史版本，旧附件与新正式附件仍均显示保留原因并禁撤回；API同样返回两项 `FORMAL_SUBMISSION`。

证据：[App待恢复](../../testing/evidence/pr39-media-20261029/app-upload-pending.png)、[失败时记录](../../testing/evidence/pr39-media-20261029/app-upload-failed.json)、[恢复后同记录](../../testing/evidence/pr39-media-20261029/app-upload-restored.json)、[旧正式／新草稿区别](../../testing/evidence/pr39-media-20261029/app-retained-old-draft-new.png)、[App历史保留](../../testing/evidence/pr39-media-20261029/app-historical-retention.png)、[网页历史保留](../../testing/evidence/pr39-media-20261029/web-historical-retention.png)、[保留与撤回接口回读](../../testing/evidence/pr39-media-20261029/retention-and-withdrawal.json)。

### 网页暂离恢复：首次阻断与随后补验

网页另建故事 `0b932f78-eae4-4e70-a996-172b8eed5edb`，同样成功注入写入失败并保留原请求。点击“先返回我的故事”后，浏览器工具在该页失去响应，无法取得可操作的确认框或关闭页面。原附件 `839f7fa2-f3c2-4ffc-bc36-f8cec3ecdb90` 仍为 `UPLOADING`，数量为1，见[失败记录](../../testing/evidence/pr39-media-20261029/web-upload-failed.json)。这是首次验证时的阻断记录，当时未计为通过。随后用户说明不记得所点按钮，按实际页面状态重建隔离资料继续补验，未把其回答解释成确认或取消。

随后先用原页面验证直接恢复：故事 `a17092b0-d7be-43a9-82ce-274715959cc8`、附件 `6a487274-fce2-498b-b37e-74df5c23c2d9` 从 `UPLOADING` 恢复为 `READY`，编号／109字节／摘要不变，记录数为1，并成功保存草稿。原生暂离确认再次造成工具无法操作，因此在 `CustomizationOwnView.vue` 仅替换待核对附件的暂离确认：使用有明确按钮和保留范围说明的页内对话框；关闭／取消不清理请求，确认离开才清理页面，原文件仍留当前会话。等待期间身份或请求变化、重复导航不会误放行。浏览器刷新／关闭的原保护保持不变。

最终用新故事 `3966525c-82ef-45da-9212-0c6f4cfab7fd` 实际验证：写入失败→Escape取消暂离→点击“继续核对”取消→点击“暂时离开”进入列表→从列表重开同一故事→核对记录→恢复原请求→保存草稿。重开前后请求键均为 `f1a3b4e5-751b-468d-861e-c02ee1e4f156`；附件 `3a61536a-762a-4c30-8c45-782bd14e211d` 从 `UPLOADING` 变为 `READY`，原大小和摘要不变，附件数始终为1。390px下对话框宽352px，默认焦点为“继续核对”，页面无横向溢出，最终控制台无错误。本轮网页“暂离→重开→恢复”现已补验通过。

补验证据：[直接恢复前](../../testing/evidence/pr39-media-20261029/web-recheck-failed.json)、[直接恢复后](../../testing/evidence/pr39-media-20261029/web-recheck-direct-restored.json)、[直接恢复页面](../../testing/evidence/pr39-media-20261029/web-direct-restored.png)、[原生暂离再次阻断时记录](../../testing/evidence/pr39-media-20261029/web-leave-recheck-failed.json)、[明确按钮](../../testing/evidence/pr39-media-20261029/web-leave-dialog.png)、[窄屏确认](../../testing/evidence/pr39-media-20261029/web-leave-dialog-narrow.png)、[重开仍为原请求](../../testing/evidence/pr39-media-20261029/web-reopened-pending.png)、[恢复后页面](../../testing/evidence/pr39-media-20261029/web-reopened-restored.png)、[暂离前附件](../../testing/evidence/pr39-media-20261029/web-dialog-upload-failed.json)、[恢复后同附件](../../testing/evidence/pr39-media-20261029/web-dialog-upload-restored.json)。

追加改动仅涉及网页确认、对应测试及证据。网页完整396项、类型检查、发布构建均通过；App源码未变，沿用同代码的684项通过结果。提交 `90dc8855` 的9项远端检查已全部通过；本次确认改动提交后的检查独立核对，不沿用该结果。

## 下一次组合验收步骤

1. 同一PR39分支、接口0.31.4、数据库0167；使用隔离资料，准备本人、独立审核人、运营与浏览者四种身份。
2. 本人选两张图片及声音／视频／文档，明确选第二张为主肖像；检查待审不可公开，审核后两端显示正确图片且可播放。再换新肖像，确认待审不替换旧图，通过后才替换；撤回后刷新清理旧内容。
3. 故事附件预留成功后模拟文件写入失败。App和网页分别核对并恢复原请求，比较恢复前后附件编号、大小、摘要和记录数，禁止换键新增。网页须同时核对“继续核对”／Escape保留原请求与“暂时离开→重开→恢复”；本轮已按上述同记录补验。
4. 原附件正式提交，运营要求补件；上传新文件仅保存草稿时旧正式附件保留、新文件可撤回。正式重提后，从未读取历史的全新页面打开，两份正式附件均提示保留且不能撤回。
5. 再按原第17组执行完整业务整链，核对同一提交的远端检查与实际双方审阅；满足定版条件后才标完整测试版可交付。

## 后续责任与边界

上一轮交给后端的“缺失对象无法原键修复”和“缺历史保留信息”已由0.31.4提供，本批已接入并按上面的实际范围验证，不继续列作未开发接口。后端 chengcongcong222 按原计划继续作品封面、实际时长、缩略图、公开机构资料及搜索，再个人中心剩余能力；前端 Bill-Billion 按对应交付点接入并补组合验收。当前不编造尚未提供的媒体字段。

第5、15组保持进行中，第17、18组未完整验收。未代另一方审阅，未合入 integration，未更新甲方网站，未启用真实收费服务。本次联调仅用回环地址、隔离MySQL库与合成文件；证据不含访问令牌、数据库凭据或真实用户材料。

网页补验结束后，临时浏览器页及回环预览已关闭；隔离数据库与访问凭据已清理，清理结果无失败。共享MySQL服务保留运行。
