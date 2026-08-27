export type CRMStage = 'Lead' | 'Contacted' | 'Qualified' | 'Proposal' | 'Won' | 'Lost'

export type CRMBrief = {
  headline: string
  summary: string
  actionItems: string[]
  decisions: string[]
  confidence: number
  updatedAt: number
}

export type CRMContactState = {
  stage?: CRMStage
  company?: string
  value?: number
  owner?: string
  notes?: string
  tags?: string[]
  nextAction?: string
  followUpAt?: string
  brief?: CRMBrief
  updatedAt: number
}

export type CRMState = Record<string, CRMContactState>

const STORAGE_KEY = 'telegram.crm.contacts.v1'

function cleanString(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanStage(value: unknown): CRMStage | undefined {
  return value === 'Lead' || value === 'Contacted' || value === 'Qualified' || value === 'Proposal' || value === 'Won' || value === 'Lost' ? value : undefined
}

function cleanBrief(value: unknown): CRMBrief | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as Partial<CRMBrief>
  const summary = cleanString(row.summary, 1800)
  if (!summary) return undefined
  return {
    headline: cleanString(row.headline, 180),
    summary,
    actionItems: Array.isArray(row.actionItems) ? row.actionItems.map(item => cleanString(item, 300)).filter(Boolean).slice(0, 5) : [],
    decisions: Array.isArray(row.decisions) ? row.decisions.map(item => cleanString(item, 300)).filter(Boolean).slice(0, 5) : [],
    confidence: Math.max(0, Math.min(1, Number(row.confidence) || 0)),
    updatedAt: Number(row.updatedAt) || Date.now()
  }
}

function cleanContact(value: unknown): CRMContactState | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<CRMContactState>
  const numericValue = Number(row.value)
  return {
    stage: cleanStage(row.stage),
    company: cleanString(row.company, 160) || undefined,
    value: Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : undefined,
    owner: cleanString(row.owner, 120) || undefined,
    notes: cleanString(row.notes, 4000) || undefined,
    tags: Array.isArray(row.tags) ? row.tags.map(tag => cleanString(tag, 48)).filter(Boolean).slice(0, 12) : [],
    nextAction: cleanString(row.nextAction, 500) || undefined,
    followUpAt: cleanString(row.followUpAt, 64) || undefined,
    brief: cleanBrief(row.brief),
    updatedAt: Number(row.updatedAt) || Date.now()
  }
}

export function loadCRMState(): CRMState {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: CRMState = {}
    for (const [id, value] of Object.entries(parsed)) {
      const cleaned = cleanContact(value)
      if (id && cleaned) result[id] = cleaned
    }
    return result
  } catch {
    return {}
  }
}

export function saveCRMState(state: CRMState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.dispatchEvent(new CustomEvent('telegram-crm:changed', { detail: state }))
  } catch {}
}

export function updateCRMContact(state: CRMState, id: string, patch: Partial<CRMContactState>): CRMState {
  const current = state[id] || { updatedAt: Date.now() }
  const nextContact = cleanContact({ ...current, ...patch, updatedAt: Date.now() }) || { updatedAt: Date.now() }
  const next = { ...state, [id]: nextContact }
  saveCRMState(next)
  return next
}

export function removeCRMContactState(state: CRMState, id: string): CRMState {
  const next = { ...state }
  delete next[id]
  saveCRMState(next)
  return next
}
