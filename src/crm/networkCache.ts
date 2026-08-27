import type { FeedItem } from '../types'
import type { NetworkContactIndex, NetworkExcludedIndex } from '../lib/api'

export const NETWORK_CATEGORIES = ['Founder', 'BD', 'Investor', 'Exchange', 'Market Maker', 'Developer', 'KOL', 'Community', 'Service Provider', 'Personal', 'Unknown'] as const
export type NetworkCategory = typeof NETWORK_CATEGORIES[number]
export type NetworkConfidence = 'High' | 'Medium' | 'Low'

export type NetworkClassification = {
  category: NetworkCategory
  company: string
  role: string
  relationshipNote: string
  confidence: NetworkConfidence
  secondaryCategory?: NetworkCategory
  classifiedAt: string
  method: 'local' | 'ai'
}

export type NetworkContactRecord = NetworkContactIndex & {
  nameHistory: Array<{ value: string; seenAt: string }>
  usernameHistory: Array<{ value: string; seenAt: string }>
  sync: {
    seeded: boolean
    complete: boolean
    hasMore: boolean
    nextBeforeId: number | null
    total: number
    cachedMessages: number
    failed?: boolean
    error?: string
    updatedAt?: string
  }
  classification?: NetworkClassification
}

export type NetworkRawMessage = FeedItem & {
  key: string
  telegramUserId: string
}

export type NetworkExcludedRecord = NetworkExcludedIndex & {
  telegramUserId?: string
  groupSourceId?: string
  groupName?: string
}

export type NetworkMeta = {
  key: string
  value: unknown
}

const DB_NAME = 'telegram-network-crm'
const DB_VERSION = 1

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'))
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'))
  })
}

export function openNetworkDB() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('contacts')) db.createObjectStore('contacts', { keyPath: 'telegramUserId' })
      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'key' })
        store.createIndex('telegramUserId', 'telegramUserId', { unique: false })
      }
      if (!db.objectStoreNames.contains('excluded')) db.createObjectStore('excluded', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open the local network cache.'))
  })
}

export async function clearNetworkCache() {
  const db = await openNetworkDB()
  const transaction = db.transaction(['contacts', 'messages', 'excluded', 'meta'], 'readwrite')
  for (const name of ['contacts', 'messages', 'excluded', 'meta']) transaction.objectStore(name).clear()
  await transactionDone(transaction)
  db.close()
}

function addHistory(history: Array<{ value: string; seenAt: string }> | undefined, value: string, seenAt: string) {
  const next = Array.isArray(history) ? [...history] : []
  if (value && next[next.length - 1]?.value !== value) next.push({ value, seenAt })
  return next.slice(-20)
}

export async function saveNetworkIndex(contacts: NetworkContactIndex[], excluded: NetworkExcludedIndex[], indexedAt: string) {
  const db = await openNetworkDB()
  const transaction = db.transaction(['contacts', 'excluded', 'meta'], 'readwrite')
  const contactStore = transaction.objectStore('contacts')
  const excludedStore = transaction.objectStore('excluded')
  const existingContacts = await requestResult(contactStore.getAll()) as NetworkContactRecord[]
  const existingById = new Map(existingContacts.map(row => [row.telegramUserId, row]))

  for (const contact of contacts) {
    const existing = existingById.get(contact.telegramUserId)
    const record: NetworkContactRecord = {
      ...existing,
      ...contact,
      nameHistory: addHistory(existing?.nameHistory, contact.name, indexedAt),
      usernameHistory: addHistory(existing?.usernameHistory, contact.username || '', indexedAt),
      sync: existing?.sync || { seeded: false, complete: false, hasMore: true, nextBeforeId: null, total: 0, cachedMessages: 0 }
    }
    contactStore.put(record)
  }

  for (const row of excluded) excludedStore.put(row)
  transaction.objectStore('meta').put({ key: 'lastIndexAt', value: indexedAt })
  await transactionDone(transaction)
  db.close()
}

export async function getNetworkContacts() {
  const db = await openNetworkDB()
  const rows = await requestResult(db.transaction('contacts', 'readonly').objectStore('contacts').getAll()) as NetworkContactRecord[]
  db.close()
  return rows
}

export async function getNetworkContact(telegramUserId: string) {
  const db = await openNetworkDB()
  const row = await requestResult(db.transaction('contacts', 'readonly').objectStore('contacts').get(telegramUserId)) as NetworkContactRecord | undefined
  db.close()
  return row || null
}

export async function patchNetworkContact(telegramUserId: string, patch: Partial<NetworkContactRecord>) {
  const db = await openNetworkDB()
  const transaction = db.transaction('contacts', 'readwrite')
  const store = transaction.objectStore('contacts')
  const current = await requestResult(store.get(telegramUserId)) as NetworkContactRecord | undefined
  if (current) store.put({ ...current, ...patch })
  await transactionDone(transaction)
  db.close()
}

export async function saveNetworkMessagePage(contact: NetworkContactRecord, messages: FeedItem[], page: { hasMore: boolean; nextBeforeId: number | null; total: number }) {
  const db = await openNetworkDB()
  const transaction = db.transaction(['contacts', 'messages'], 'readwrite')
  const messageStore = transaction.objectStore('messages')
  for (const message of messages) {
    messageStore.put({ ...message, key: `${contact.telegramUserId}:${message.messageId}`, telegramUserId: contact.telegramUserId })
  }
  const cached = await requestResult(messageStore.index('telegramUserId').count(IDBKeyRange.only(contact.telegramUserId)))
  transaction.objectStore('contacts').put({
    ...contact,
    sync: {
      ...contact.sync,
      seeded: true,
      complete: !page.hasMore,
      hasMore: page.hasMore,
      nextBeforeId: page.nextBeforeId,
      total: Math.max(Number(page.total || 0), Number(contact.sync.total || 0)),
      cachedMessages: Number(cached),
      failed: false,
      error: undefined,
      updatedAt: new Date().toISOString()
    }
  })
  await transactionDone(transaction)
  db.close()
}

export async function markNetworkContactFailed(telegramUserId: string, error: string) {
  const current = await getNetworkContact(telegramUserId)
  if (!current) return
  await patchNetworkContact(telegramUserId, { sync: { ...current.sync, failed: true, error, updatedAt: new Date().toISOString() } })
}

export async function getNetworkMessages(telegramUserId: string) {
  const db = await openNetworkDB()
  const rows = await requestResult(db.transaction('messages', 'readonly').objectStore('messages').index('telegramUserId').getAll(IDBKeyRange.only(telegramUserId))) as NetworkRawMessage[]
  db.close()
  return rows.sort((a, b) => a.timestamp - b.timestamp || a.messageId - b.messageId)
}

export async function getAllNetworkMessages() {
  const db = await openNetworkDB()
  const rows = await requestResult(db.transaction('messages', 'readonly').objectStore('messages').getAll()) as NetworkRawMessage[]
  db.close()
  return rows
}

export async function saveNetworkExcluded(rows: NetworkExcludedRecord[]) {
  if (!rows.length) return
  const db = await openNetworkDB()
  const transaction = db.transaction('excluded', 'readwrite')
  const store = transaction.objectStore('excluded')
  for (const row of rows) store.put(row)
  await transactionDone(transaction)
  db.close()
}

export async function getNetworkExcluded() {
  const db = await openNetworkDB()
  const rows = await requestResult(db.transaction('excluded', 'readonly').objectStore('excluded').getAll()) as NetworkExcludedRecord[]
  db.close()
  return rows
}

export async function setNetworkMeta(key: string, value: unknown) {
  const db = await openNetworkDB()
  const transaction = db.transaction('meta', 'readwrite')
  transaction.objectStore('meta').put({ key, value })
  await transactionDone(transaction)
  db.close()
}

export async function getNetworkMeta<T>(key: string, fallback: T): Promise<T> {
  const db = await openNetworkDB()
  const row = await requestResult(db.transaction('meta', 'readonly').objectStore('meta').get(key)) as NetworkMeta | undefined
  db.close()
  return (row?.value as T | undefined) ?? fallback
}
