export type CRMTask = {
  id: string
  title: string
  contactId?: string
  username?: string
  dueAt?: string
  completed?: boolean
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'telegram.crm.tasks.v1'

function cleanTask(value: unknown): CRMTask | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<CRMTask>
  const title = typeof row.title === 'string' ? row.title.trim().slice(0, 300) : ''
  if (!title) return null
  return {
    id: typeof row.id === 'string' && row.id ? row.id : crypto.randomUUID(),
    title,
    contactId: typeof row.contactId === 'string' && row.contactId ? row.contactId : undefined,
    username: typeof row.username === 'string' && row.username ? row.username.replace(/^@/, '').slice(0, 64) : undefined,
    dueAt: typeof row.dueAt === 'string' && row.dueAt ? row.dueAt : undefined,
    completed: Boolean(row.completed),
    createdAt: Number(row.createdAt) || Date.now(),
    updatedAt: Number(row.updatedAt) || Date.now()
  }
}

export function loadTasks(): CRMTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(cleanTask).filter((row): row is CRMTask => Boolean(row)) : []
  } catch {
    return []
  }
}

export function saveTasks(tasks: CRMTask[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

export function createTask(input: Pick<CRMTask, 'title' | 'contactId' | 'username' | 'dueAt'>): CRMTask {
  const now = Date.now()
  return cleanTask({ ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now })!
}
