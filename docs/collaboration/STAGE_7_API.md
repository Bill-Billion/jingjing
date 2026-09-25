# 第七阶段：队友怎样接制作、反馈和验收页面

本侧负责服务器与数据库；队友负责App、制作工作台和审核页面，未代为认领。新增15项接口已有隔离测试；真实数字人供应商尚未选定，具体联网接入仍未实现，不能显示数字人已经建成或视频已经生成。

## 页面上的完整顺序

1. 商家选择订单里的制作明细，指定已审核的剧本版本、制作方成员、本人同意记录和开工证据。每条制作明细只建一个项目，使用原订单的规格与合同摘要。
2. 独立审核人员核对合同、签署、身份和权利材料。这里是人工核验真实外部材料，不是假称平台实名或电子签成功。约定首款未到账时，不能上传交付或开始生成。
3. 制作负责人上传私有文件，提交剧本版本。独立审核通过后，客户确认这个版本；随后按样片、粗剪、成片继续。
4. 客户反馈绑定具体版本。提交新稿后，旧稿及后续环节的确认失效，不能拿旧稿确认放行新稿。历史版本和反馈继续保留。
5. 客户看成片预览并确认最终验收；服务器据当前有效确认开放订单约定的付款节点。只有约定款项付清且最终版本已验收，才开放最终文件下载。

样片确认、成片验收、付款成功、最终文件下载是不同事实。订单的付款计划仍以原快照为准，不擅自设50%首款等参数。报价中的修改次数按每条制作明细记录客户提出修改的次数；制作方内部补稿不占用客户次数。超出已约定次数需处理合同或报价，接口不擅自加价。

## 服务器入口

前缀/api/v1/production，全部需要Bearer登录。普通操作使用X-Acting-Party；审核、读取开工证据及人工恢复任务使用PRODUCTION_REVIEW权限。写入需要Idempotency-Key；涉及版本的操作需If-Match，格式例如双引号包围的数字。完整字段见[OpenAPI](../../contracts/openapi.yaml)，版本0.7.0-rc.1。

|要做什么|方法与后缀|谁可以做|
|---|---|---|
|建立制作项目|POST /projects|订单商家的OWNER；制作方来自订单明细，不能临时换成任意机构|
|查看项目列表|GET /projects|本方OWNER或实际被分配任务的成员|
|看一条制作记录|GET /records/{record_id}|有权限的项目参与方或审核人员|
|列版本、反馈、文件或任务|GET /projects/{project_id}/records|项目参与方或审核人员；传kind、cursor、limit|
|审核开工依据或交付版本|POST /records/{record_id}/reviews|独立审核人员，排除创建者和项目各方机构成员|
|更换负责人|POST /projects/{record_id}/assignment|商家OWNER；目标必须是制作方当前成员|
|上传文件|POST /projects/{project_id}/files?media_type=...|当前制作负责人，原始文件作为application/octet-stream上传|
|提交新版本|POST /projects/{record_id}/versions|当前制作负责人；stage为SCRIPT、SAMPLE、ROUGH_CUT或FINAL|
|反馈或验收|POST /versions/{record_id}/feedback|买方OWNER；ACCEPT或REQUEST_CHANGES，必须针对当前已审版本|
|读取版本文件|GET /versions/{record_id}/content?variant=preview或final|每次重新检查权限、付款、同意及许可；客户最终文件另须付清和验收|
|读取开工材料|GET /projects/{record_id}/evidence|审核人员，只能读取本项目关联材料|
|查看生成服务状态|GET /projects/{record_id}/generation-readiness|项目参与方；当前默认NOT_ENABLED|
|申请长期资产创建、生成或删除|POST /projects/{record_id}/generation|当前制作负责人；服务未启用时拒绝，不排假任务|
|查询任务是否真正执行|GET /generations/{record_id}/job|项目参与方或审核人员|
|恢复原任务|POST /generations/{record_id}/retry|独立审核人员，填写reason_ref；恢复后查原任务，不重复创建外部请求|

SCRIPT只接文本，其他版本接视频。单文件上传上限50MiB，是当前私有存储接口的技术限制，不是已批准的商业片长或清晰度。最终原片与预览必须是不同文件；预览是否有正确标识由独立审核人员实际检查。服务器核对文件字节和摘要，不宣称自动加水印、自动判断画质或已经通过真实试片验收。审核不能只看文件名或勾选框就当作实际检查过。

项目合同摘要与规格来自订单，上传材料不能改变这些约定。审核被拒的版本可按原项目提交新版本；开工依据被拒的项目本阶段没有自动改约或自动放行入口，须先查清材料与原合同是否一致，再安排处理。

## 页面状态的含义

|记录|状态应该怎样展示|
|---|---|
|制作项目|IN_REVIEW待审；READY具备开工审核条件但还需检查付款；IN_PROGRESS制作中；ACCEPTED最终版本已验收|
|制作版本|IN_REVIEW待独立审核；APPROVED可交客户确认；REJECTED被退回。APPROVED不等于客户已验收|
|文件|UPLOADING正在上传；READY已核对文件存储；FAILED上传失败，不能假装成功|
|生成任务记录|QUEUED或PENDING只表示请求记录/处理中，实际执行状态另查job接口|
|后台任务|BLOCKED结果或条件待人工核实；RETRY只会核对原任务；SUCCEEDED也不等于文件已交付|
|长期数字人资产|READY表示已取得上游长期资产映射；DELETE_REQUIRED待删除处理；DELETING等待确认；DELETED才表示上游确认删除|
|服务状态|NOT_ENABLED明确显示未启用，不切换演示素材充当用户成片|

生成结果仍须进入私有文件、版本审核和客户验收，不能直接替换已确认版本。生成接口当前默认关闭；测试替身仅用于隔离测试，不可由HTTP参数或环境模块路径加载。

## 队友如何同步

取得core/stage-7-production-acceptance即可拿到本阶段及必要前置，不需逐条挑提交。先审第11至15份，再审本阶段；只看本阶段差异可用git diff b9f90bd...core/stage-7-production-acceptance。前端无需理解数据库字段，按本接口文件传参数即可。

队友可以先完成项目列表、负责人、上传与版本列表、反馈及验收页面。真实生成、长期资产多次效果和删除验收，等供应商具体产品资料齐备后再接实际服务。本侧下一阶段按计划做商单、直接MCN合作和单笔佣金，持续处理本阶段评审意见。
