export interface BusinessPrerequisite { title: string; message: string; steps: string[]; links: { to: string; label: string }[] }
const prerequisites: Record<string, BusinessPrerequisite> = {
  'cocreation/room': {
    title: '本人发起共创：从已提交故事开始',
    message: '当前尚不能选择获准承制方，首次建房暂不能提交。已提交的私人故事与生效参加规则可先读取；选中的办理身份不能代替承制方资格。',
    steps: ['提交本人的私人故事', '选择当前获准承制方和共创规则', '明确名称、用途、地区与截止时间', '建立房间后逐位邀请，由每位本人独立确认'],
    links: [{ to: '/operations/customization/mine', label: '继续本人的私人故事' }, { to: '/cocreation/rules', label: '阅读当前共创规则' }],
  },
}
export function businessPrerequisite(domain: string, operation: string): BusinessPrerequisite | null { return prerequisites[`${domain}/${operation}`] || null }
