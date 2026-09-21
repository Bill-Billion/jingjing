# 执行期硬规范

1. 直接面向交付版：允许test/local替身，production禁止假成功和自动Mock。
2. 不整体重写旧Flutter/Express；重构核心边界，复用可用资产。
3. 服务端拥有状态机；客户端消费current_status + allowed_actions。
4. 价格、规格、修改轮次、佣金、退款、合同、授权、规则全部版本化。
5. 交易成交保存不可变快照；新默认不重算旧单。
6. 支付、退款、许可、独家预留、AI任务、webhook、结算全部幂等。
7. AI/视频/删除/对账等长任务必须持久化、可恢复、多实例不重复。
8. Payment/Refund/Payable/Payout/Revenue/Settlement/Adjustment用追加事实/冲正，不覆盖历史。
9. 权利、合同、确认、版本历史不覆盖。
10. 真人素材、声音、剧本全文、合同、实名附件默认private。
11. 每次敏感访问由服务端按actor+acting_party+object+purpose+expiry重新鉴权。
12. vendor SDK只能出现在Provider Adapter。
13. 新依赖必须说明收益、运行成本和替代方案。
14. 未有测量证据不引入Redis/Kafka/ES/微服务。
15. UI采用Token→Component→Business Component→Page，视觉修改不改变domain state。
16. secret不入Git；日志禁止完整身份证、人脸原图、私密剧本、支付私钥/token。
17. 每个Task必须提交：代码+测试+Task Record+CURRENT更新+commit。
18. 测试报告必须写“跑了什么/没跑什么/环境/commit/skip原因”，测试数量不等于验收。
