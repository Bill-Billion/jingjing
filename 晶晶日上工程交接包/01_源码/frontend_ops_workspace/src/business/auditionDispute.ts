import { rowData, type BusinessData } from '@/api/modules/business'
import { uuid } from './model'

// Only the evidence attached to the current dispute can be offered to support.
export function auditionDisputeEvidence(record: BusinessData | null): string[] {
  if (!record || record.kind !== 'BOOKING' || record.current_status !== 'DISPUTED') return []
  const dispute = rowData(record).dispute as BusinessData | undefined
  const ids = dispute?.evidence_asset_ids
  if (!uuid(dispute?.id) || !Array.isArray(ids) || ids.length > 30 ||
      ids.some(id => !uuid(id)) || new Set(ids).size !== ids.length) return []
  return ids as string[]
}

export function auditionResolutionEvidenceReady(value: unknown, available: string[], retrieved: string[]): boolean {
  const ids = String(value || '').split(/[\s,，;；]+/).filter(Boolean)
  return ids.length > 0 && new Set(ids).size === ids.length &&
    ids.every(id => available.includes(id) && retrieved.includes(id))
}
