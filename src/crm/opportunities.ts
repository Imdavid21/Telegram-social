export type PipelineStage = 'Lead' | 'Contacted' | 'Qualified' | 'Proposal' | 'Won' | 'Lost'

export type CRMOpportunity = {
  id: string
  title: string
  contactId?: string
  username?: string
  company?: string
  stage: PipelineStage
  value?: number
  notes?: string
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'telegram.crm.opportunities.v1'
export const PIPELINE_STAGES: PipelineStage[] = ['Lead', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost']

function clean(value: unknown): CRMOpportunity | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<CRMOpportunity>
  const title = typeof row.title === 'string' ? row.title.trim().slice(0, 240) : ''
  if (!title) return null
  const stage = PIPELINE_STAGES.includes(row.stage as PipelineStage) ? row.stage as PipelineStage : 'Lead'
  const numeric = Number(row.value)
  return {
    id: typeof row.id === 'string' && row.id ? row.id : crypto.randomUUID(),
    title,
    contactId: typeof row.contactId === 'string' && row.contactId ? row.contactId : undefined,
    username: typeof row.username === 'string' && row.username ? row.username.replace(/^@/, '').slice(0, 64) : undefined,
    company: typeof row.company === 'string' && row.company.trim() ? row.company.trim().slice(0, 160) : undefined,
    stage,
    value: Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined,
    notes: typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim().slice(0, 3000) : undefined,
    createdAt: Number(row.createdAt) || Date.now(),
    updatedAt: Number(row.updatedAt) || Date.now()
  };
}

export function loadOpportunities(): CRMOpportunity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(clean).filter((row): row is CRMOpportunity => Boolean(row)) : []
  } catch {
    return []
  }
}

export function saveOpportunities(rows: CRMOpportunity[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function createOpportunity(input: Partial<CRMOpportunity> & Pick<CRMOpportunity, 'title'>): CRMOpportunity {
  const now = Date.now()
  return clean({ ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now })!
}
