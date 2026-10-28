export interface BusinessPrerequisite { title: string; message: string; steps: string[]; links: { to: string; label: string }[] }
const prerequisites: Record<string, BusinessPrerequisite> = {
  'stock/listing': {
    title: '首次上架：先准备影片与逐人权利',
    message: '当前尚不能读取本身份可用的销售规则，首次上架暂不能提交。可先填写本页草稿并准备材料；旧商品中的规则不代表当前仍有销售资格。',
    steps: ['准备已审核的现货商品规格', '上传不同的正式影片与预览影片', '逐人核对本次销售与公开展示授权', '取得当前可用规则后，提交内容与权利两项独立审核'],
    links: [{ to: '/trade/specifications', label: '查看本人商品规格' }, { to: '/artists/people', label: '核对人物与授权' }],
  },
  'auditions/offer': {
    title: '首次试镜方案：核对人物、授权与服务安排',
    message: '当前尚不能读取本身份可用的试镜经营规则，首次方案暂不能提交。先准备本人资料、展示授权、真实可约时段与安全安排。',
    steps: ['核对具体真人与数字人', '确认公开预约和价格展示意愿', '填写真实服务地区、时段与取样范围', '取得当前规则后提交独立核验，审核通过才公开可约'],
    links: [{ to: '/artists/people', label: '查看人物与授权' }, { to: '/auditions/offers', label: '查看已有方案及审核状态' }],
  },
  'cocreation/room': {
    title: '本人发起共创：从已提交故事开始',
    message: '当前尚不能选择获准承制方，首次建房暂不能提交。已提交的私人故事与生效参加规则可先读取；选中的办理身份不能代替承制方资格。',
    steps: ['提交本人的私人故事', '选择当前获准承制方和共创规则', '明确名称、用途、地区与截止时间', '建立房间后逐位邀请，由每位本人独立确认'],
    links: [{ to: '/operations/customization/mine', label: '继续本人的私人故事' }, { to: '/cocreation/rules', label: '阅读当前共创规则' }],
  },
}
export function businessPrerequisite(domain: string, operation: string): BusinessPrerequisite | null { return prerequisites[`${domain}/${operation}`] || null }
