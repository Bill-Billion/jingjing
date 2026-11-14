# 公开试镜粗略服务区域距离：后端交接

后端负责人chengcongcong222，来源a1a7b222，接口0.31.62-rc.1/迁移0215。当前只共享接口，不安排前端开发、不代Bill-Billion认领。最终验证见REPORT。

|接口|用途|身份与约束|
|---|---|---|
|GET /api/v1/auditions/offers/{record_id}/distance-location|本人读当前区域声明|艺人本人个人身份，X-Acting-Party必填；无声明object_version=0，grid=null|
|POST 同上|声明/变更/撤销|本人；If-Match用地点自身版本（首次为"0"），Idempotency-Key必填；不使用服务报价版本|
|POST /api/v1/discovery/auditions/distance|当次近似距离筛选|登录账号，不带机构身份或查询参数；这是只读POST，无写入幂等记录，不要求Idempotency-Key|
|原privacy请求的account-data，section=AUDITION_DISTANCE_LOCATIONS|本人当前声明副本|沿用具体申请的本人/独立运营权限及PROFILE/ALL范围；不自动完成请求|

声明正文enabled=true时需grid和consent；撤销enabled=false时禁止携带grid/consent。grid为latitude_grid整数[-9000,9000]、longitude_grid整数[-18000,17999]，单位0.01度；极点经度归零。只接受本人愿意公开的粗略服务区域，不传精确坐标或私人地址。consent固定purpose=PUBLIC_AUDITION_DISTANCE、notice_version=audition-distance-v1、accepted=true；服务仍须为合格公开线下试镜。机构代办、普通客服和独审均不能替代本人同意。

查询正文origin使用相同格点结构，consent为本次计算声明，max_distance_km整数1—500，可选city/q/cursor/limit。无需位置仍走既有discovery/search按城市浏览。返回basis=DECLARED_SERVICE_AREA_GRID、approximate=true、distance_unit=KM_CEILING及offer/distance_km；距离按两粗化区域格点的直线距离向上取整，不是实时艺人位置、实际交通路线或精确导航。未声明区域的服务不进入距离列表，仍能城市浏览，不假报0公里。

游标绑定账号、粗略起点、范围、城市和关键词，仅编码距离桶/服务编号，改变条件必须从首屏开始。最多扫描10页，过滤后空items且next_cursor非空可继续；当前状态重核但不承诺并发位置变更时的快照排序。价格隐藏沿用原服务，不通过距离接口公开私有价格。

本人声明的当前格点只保存在专用表，撤销设NULL；旧幂等结果和审计不保存格点，旧键返回当前状态。查询不写命令/审计/业务事件或网址；接口返回Cache-Control=no-store，不返回起点、服务格点或精确距离。当前声明仅本人直接读取或按本人隐私申请受控取数；不编造查询轨迹或历史地点。

新迁移未在生产执行，无实际授权或真人坐标采集。接口只能验证声明格式和账号权限，不能证明手机系统定位已获准或真人确已知悉；上线前仍需实际告知、单独同意、影响评估及部署日志/加密/保留配置核验。粗略服务区域可通过多次距离查询推断，所以不能承诺匿名，也不能让用户填私人住址。当前不开发设备权限弹窗、页面或地图接入。
