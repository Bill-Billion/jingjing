# 前端接入：个人现货与独立商用许可

2026-11-02。后端负责人 chengcongcong222；前端负责人 Bill-Billion。接口0.31.21-rc.1、迁移0193，集中沿原PR39交付；准确上传版本见本批记录。用户已转发，Bill-Billion已认领并完成本地双端接入及分层自验；按用户14:36新确认集中交付，未代后端复验。不要使用旧integration搭配新版页面。

## 用户要办成什么

个人购买用于个人分享；企业或个人需要品牌宣传等用途时，购买另一份明确范围的商用商品。付款前看清价格、用途、地域、期限；原个人订单不会因为平台增加商用能力就自动变成商用。

依据[11号第二条](../../sources/contracts-20261029/extracted/11.md)原文：“商用授权为单独商品/加价项，买受人购买后在商品页载明的商用范围内使用；许可地域（默认全球）与期限以商品页/订单为准。”

实施补全：本轮先采用独立商品，价格由审核后的规格给出；暂不做给旧订单加价升级。商用先支持固定起止日期；用途为品牌宣传、商业广告、企业展示，均须逐项明确。不是新增版权交易所；不授予转售、再许可、改编、发行、训练权。机构采购限已核准BRAND_CLIENT且由成年实名负责人操作，是本轮保守实施口径，不冒称原文要求。

## 请接三项工作

|工作|页面需要做什么|完成标准|
|---|---|---|
|1. 出镜授权和上架审核|App及相关网页分开显示个人非商用/商用；本人授权选择具体用途，运营逐项核验商用依据|仅有旧个人授权不能提交商用；机构不能代本人同意；运营未明确商用核验不能通过|
|2. 商品和付款前许可|按服务器返回的价格、用途、地域、有效期展示；机构身份按资格办理；不默认勾选商用、不固定价格|个人旧商品仍按原用途；机构不能买个人专属商品；合格机构可确认商用订单；切身份清旧资料|
|3. 原单许可、下载与恢复|在订单/作品入口显示购买时的商用范围；到期、撤权、退款或尚未启用时准确说明；失败恢复沿原请求|同一次下单断网重试只产生一个订单；无权限不展示旧数据；退款/到期下载受阻，历史许可内容不被覆盖|

## 接口变化和权限

不新增调用路径。沿现有现货规格、上架选项、本人授权、双审、目录、购买、订单和下载接口。精确路径及字段见仓库contracts/openapi.yaml。

- `StockSpecification.stock_license`、`StockLicense`新增`scope: COMMERCIAL_LIMITED`；`exclusive:false`、`duration:FIXED_TERM`、`valid_from/valid_until`为UTC时间、`territory`明确、`commercial_uses`非空、`personal_social_sharing:false`。原个人分支不变。
- 用途：`BRAND_PROMOTION`品牌宣传、`COMMERCIAL_ADVERTISING`商业广告、`CORPORATE_DISPLAY`企业展示；只按实际选择显示。仍展示`excluded`及`limited_to_buyer:true`。
- 本人授权`purposes`在现有`STOCK_LICENSE`、`PUBLIC_DISPLAY`外增加`STOCK_COMMERCIAL`，并填写`stock_commercial_uses`。授权地域及日期必须覆盖商品；不能凭界面勾选绕过本人及独立审核。
- `StockReviewRequest.verification.commercial_use_verified:true`为商用权利审核必需；旧个人审核不受影响。
- 上架选项`StockSalesOption.license`、人员选项`territories/purposes/stock_commercial_uses`用于准确选择；看到选项不等于可以绕过提交核验。
- 机构购买需要现有`BRAND_CLIENT`生效能力和机构OWNER，操作人须有成年实名个人档案；普通个人购买仍核实名成年人。不是任意机构成员都可付款。
- `STOCK_COMMERCIAL_NOT_ENABLED`：本环境尚未开放商用购买；`STOCK_COMMERCIAL_BUYER_REQUIRED`：机构采购资格缺失；`STOCK_COMMERCIAL_CONSENT_REQUIRED`：本人商用授权未覆盖；`STOCK_COMMERCIAL_LICENSE_NOT_ACTIVE`：未到生效日或已过期。沿统一错误体展示可操作说明，不显示“成功”。

## 同一记录联调

用隔离合成资料：本人分别批准商用用途→卖家选择商用规格→内容和权利独立审核→机构买家确认范围→模拟付款→本人授权范围内下载并核文件哈希→售后独立审核退款→原单保留、下载失效。另测只给个人授权、区域/用途不覆盖、到期、陌生机构、旧个人单、原请求重试。

本环境须显式开启`STOCK_COMMERCIAL_LICENSE_ENABLED=true`才测试新售；默认false。旧商品和已购订单不改；本轮没有开启甲方网站或真实付款。示例价50000分仅用于测试，不是业务默认价。

后端专项命令：在backend_server目录设置本机隔离MySQL配置后执行`node scripts/test-mysql.js stock-commercial`；测试只建随机测试库并清理，不调用收费服务。后端已有11项专项通过；实际页面及原生链仍由双方同版补验。
