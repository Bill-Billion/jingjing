# 前端接入：公开机构资料、精选艺人和机构通告

后端负责人 chengcongcong222 提供接口和隔离资料；前端负责人 Bill-Billion 负责 App 与按角色需要的网页。用户负责转达。本文件准备好不等于对方已经接收或开工；上传事实见本流进度。这是原第6组，不新增产品范围。

## 用户可以办什么

机构负责人填写公开介绍和主图、提交材料，由另一位有权审核的人确认后展示。访客登录后能查看当前有效介绍和该机构的全部公开通告。运营能从当前可公开艺人中提出精选、写推荐说明和展示期限，经独立审核后展示。撤回、期限结束或原授权失效时页面要清掉旧结果。

机构公开资料不会自动授予接单、制作、开通服务或代办艺人权限。精选显示“精选艺人／运营推荐”，不显示虚构明星认证、成绩或排名。主体字段指经营机构；推荐来源指具体艺人公开档案，不能把两者当同一种角色。

## 获取同版代码

沿原 PR39 的 `core/full-business-closure-20261028`；接口候选 **0.31.6-rc.1**，数据库迁移 **0170**。迁移0168—0170是三张新增表；无需修改旧表。没有前端新增页面验收或部署事实，不从integration旧版复制调用。旧接口保持兼容。

## 页面与接口

以下路径省略 `/api/v1`。所有请求都要登录。公开页面和运营审核请求不带 `X-Acting-Party`；机构本人办理必须带自己的机构编号。

|页面动作|接口|使用限制与返回|
|---|---|---|
|提交机构公开介绍|`POST /directory/organization-profiles`|负责人机构身份；`profile` 详细字段见接口文件，材料必须本人机构所有；提交后IN_REVIEW，不能显示已公开|
|查本人申请与历史|`GET /directory/records?kind=ORGANIZATION`、`GET /directory/records/{record_id}`|带机构身份时只允许机构负责人；不带时须对应审核岗位|
|审核工作列表|同上，kind也支持FEATURED_ARTIST|机构资料用SUPPLY_REVIEW_PROFILE；精选用ARTIST_REVIEW_CONTENT；提出者或相关机构成员不能审核自己|
|读取证明材料|`GET /directory/records/{record_id}/materials/{asset_id}`|只对该申请中引用的材料开放；负责人/审核人可下载；不将证明放进公开页面|
|审核、退回|`POST /directory/records/{record_id}/reviews`|APPROVE须全部确认项为true；REJECT须checks=null并填原因；要带当前If-Match和原请求键|
|撤回|`POST /directory/records/{record_id}/withdrawals`|机构负责人撤回本机构资料；对应运营可下架；填写reason，并带版本和原请求键|
|机构列表和详情|`GET /directory/organizations`、`GET /directory/organizations/{party_id}`|只含已审公开字段、有效期和获准主图元信息；不调用私人party详情拼接|
|机构主图|`GET /directory/organizations/{party_id}/cover`|取带登录权限的图片字节创建临时地址；无公开存储URL，撤回/失效/切身份要回收旧图|
|选择精选来源|沿现有艺人公开目录与媒体接口|不能从未审核或私人艺人列表选择后假称公开|
|提出精选|`POST /directory/featured-artists`|运营填写listing_id、recommendation、sort_order、valid_from、valid_until；等待独立审核|
|读取精选|`GET /directory/featured-artists`|selection_kind固定EDITORIAL_SELECTION；artist引用原公开档案，媒体沿该listing_id既有接口获取|
|机构全部通告|`GET /notices/catalog?publisher_party_id={party_id}`|原cursor/limit分页，原类型/城市筛选可并用；资格失效和关闭通告不返回|

目录列表支持city、q、cursor、limit。q在服务器按公开名称/简介（艺人含已公开标签）查找；不在首屏上做假全量搜索。城市沿现有六城简称/“市”后缀兼容，其余精确匹配；这不等于统一全国城市目录已经完成。

公开目录以已审sort_order、记录id确定顺序。游标绑定目录种类和当前筛选；本人列表还绑定机构身份，跨条件复用返回INVALID_CURSOR。每次最多100项，允许因动态权限过滤后items为空但next_cursor仍非空，必须按next_cursor决定是否读完。资格或可见性变化时重新查询，不承诺旧列表快照永远有效。

## 表单材料与失败处理

- 主图可空；使用现有供给附件上传，purpose=WORK_CONTENT，JPEG/PNG且不超过8MiB。证明为同机构RIGHTS_EVIDENCE或REVIEW_EVIDENCE，最多10份；不拿私人艺人材料冒充机构主图。
- 机构能力从本人机构现有查询中选择ACTIVE项；提交不改变能力状态。审核需确认identity_verified、capabilities_verified、materials_reviewed、public_display_authorized、no_private_contact。
- 精选审核需确认public_source_verified、recommendation_reviewed、not_star_certification。内容是已审文字，不自动生成明星结论或未知商业指标。
- 每次写入保留Idempotency-Key；结果不确定先读原申请/记录，再用原键原内容核对。修改内容要另提新申请；不能把旧键用于新内容。已批准记录的重放结果只是原操作回执，随后GET读取当前状态。
- 新版本审核通过即替换旧版本；若有效期起点在未来，生效前不展示。表单需要提示这点，不承诺定时自动保留旧版切换。
- 412先重读再由用户确认；403/404/409清理无权或失效公开内容；503保留本次输入并提示读取失败，不退回假图片或假成功。图片读完仍会再次检查权限，撤回与下载并发时也可能失败。

## 同版验收和模拟资料

后端 `test/helpers/directory-seed.cjs` 组合了真实隔离账号、公开艺人、授权、托管及通告规则；`test/directory.integration.test.cjs` 建立合成机构、主图和证明，经过实际HTTP完成申请—审核—公开—更新—撤回。真实第三方请求为0，测试结束删除临时库。材料只供隔离测试，不能复制为正式经营事实。

前端接入后按同一机构和同一艺人验证：申请未审不可见→另一账号读证据并审核→列表及详情/主图一致→发布方通告逐页读完→更新资料通过后只有一个公开版本→旧图撤回/能力收回不可继续展示；再验证精选未审、到期、原艺人授权撤回、切换身份、无结果和重复提交。两端页面与接口编号一起记录，不能用本文件代替页面实测。

本侧下一步继续原第7组的统一城市和搜索，其后是个人中心、反馈与整体业务检查；新页面不阻塞这些后端工作。
