export interface BusinessPrerequisite { title: string; message: string; steps: string[]; links: { to: string; label: string }[] }
const prerequisites: Record<string, BusinessPrerequisite> = {
}
export function businessPrerequisite(domain: string, operation: string): BusinessPrerequisite | null { return prerequisites[`${domain}/${operation}`] || null }
