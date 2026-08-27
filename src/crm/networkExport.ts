import type { NetworkAnalysisRow } from './networkAnalysis'
import type { NetworkExcludedRecord } from './networkCache'

export type NetworkCoverageSummary = {
  startedAt?: string
  completedAt?: string
  firstMessageAt?: string
  lastMessageAt?: string
  failedContacts: Array<{ name: string; error: string }>
  failedGroups: Array<{ name: string; error: string }>
  partialContacts: number
  note?: string
}

type Pair = [string, number]

function tally(values: string[], minimum = 1, limit = 12): Pair[] {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const value = String(raw || '').trim()
    if (!value) continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count >= minimum).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
}

function chartPng(title: string, entries: Pair[], width = 980, height = 360) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#161617'
  ctx.font = '600 26px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
  ctx.fillText(title, 28, 42)
  if (!entries.length) {
    ctx.fillStyle = '#8A8A8E'
    ctx.font = '400 18px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    ctx.fillText('No data yet', 28, 88)
    return canvas.toDataURL('image/png')
  }
  const labelWidth = 220
  const top = 72
  const rowHeight = Math.min(40, Math.floor((height - top - 22) / entries.length))
  const max = Math.max(...entries.map(([, value]) => value), 1)
  entries.forEach(([label, value], index) => {
    const y = top + index * rowHeight
    ctx.fillStyle = '#6E6E73'
    ctx.font = '500 14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
    ctx.fillText(label.length > 28 ? `${label.slice(0, 26)}…` : label, 28, y + 19)
    const barX = labelWidth
    const maxBar = width - barX - 92
    const barWidth = Math.max(3, Math.round(maxBar * value / max))
    ctx.fillStyle = '#E8E8ED'
    ctx.fillRect(barX, y + 6, maxBar, 16)
    ctx.fillStyle = '#1D1D1F'
    ctx.fillRect(barX, y + 6, barWidth, 16)
    ctx.fillStyle = '#1D1D1F'
    ctx.textAlign = 'right'
    ctx.fillText(String(value), width - 28, y + 19)
    ctx.textAlign = 'left'
  })
  return canvas.toDataURL('image/png')
}

function isoDate(value?: Date) {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null
}

function setHeader(row: any) {
  row.height = 24
  row.eachCell((cell: any) => {
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FF1D1D1F' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F7' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD2D2D7' } } }
    cell.alignment = { vertical: 'middle' }
  })
}

export async function exportNetworkWorkbook(rows: NetworkAnalysisRow[], excluded: NetworkExcludedRecord[], coverage: NetworkCoverageSummary) {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  workbook.creator = 'Telegram CRM'
  workbook.created = new Date()

  const network = workbook.addWorksheet('Network', { views: [{ state: 'frozen', ySplit: 1 }] })
  network.columns = [
    { header: 'Telegram User ID', key: 'telegramUserId', width: 18 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Username', key: 'username', width: 22 },
    { header: 'Username History', key: 'usernameHistory', width: 30 },
    { header: 'Name History', key: 'nameHistory', width: 32 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Secondary Category', key: 'secondaryCategory', width: 20 },
    { header: 'Company', key: 'company', width: 24 },
    { header: 'Role', key: 'role', width: 24 },
    { header: 'Relationship Note', key: 'relationshipNote', width: 54 },
    { header: 'Confidence', key: 'confidence', width: 13 },
    { header: 'Messages From Them', key: 'messagesFromThem', width: 18 },
    { header: 'Messages From Me', key: 'messagesFromMe', width: 17 },
    { header: 'Total Messages', key: 'totalMessages', width: 15 },
    { header: 'First Message', key: 'firstMessageAt', width: 20 },
    { header: 'Last Message', key: 'lastMessageAt', width: 20 },
    { header: 'Thread Duration (days)', key: 'threadDurationDays', width: 21 },
    { header: 'Flag', key: 'flag', width: 22 },
    { header: 'Coverage', key: 'coverage', width: 13 }
  ]
  setHeader(network.getRow(1))
  for (const row of rows) {
    network.addRow({ ...row, firstMessageAt: isoDate(row.firstMessageAt), lastMessageAt: isoDate(row.lastMessageAt) })
  }
  network.autoFilter = { from: 'A1', to: `S${Math.max(1, network.rowCount)}` }
  network.getColumn('firstMessageAt').numFmt = 'yyyy-mm-dd hh:mm'
  network.getColumn('lastMessageAt').numFmt = 'yyyy-mm-dd hh:mm'
  network.getColumn('relationshipNote').alignment = { wrapText: true, vertical: 'top' }
  network.getColumn('flag').alignment = { vertical: 'middle' }
  if (network.rowCount > 1) {
    network.addConditionalFormatting({
      ref: `R2:R${network.rowCount}`,
      rules: [{ type: 'expression', formulae: ['LEN($R2)>0'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFE5E5' }, fgColor: { argb: 'FFFFE5E5' } }, font: { color: { argb: 'FF9F1A1A' } } } }]
    })
  }

  const dashboard = workbook.addWorksheet('Dashboard', { views: [{ state: 'frozen', ySplit: 1 }] })
  dashboard.columns = Array.from({ length: 14 }, () => ({ width: 12 }))
  dashboard.mergeCells('A1:N2')
  dashboard.getCell('A1').value = 'Telegram Network CRM'
  dashboard.getCell('A1').font = { name: 'Aptos Display', size: 26, bold: true, color: { argb: 'FF1D1D1F' } }
  dashboard.getCell('A1').alignment = { vertical: 'middle' }

  const cards = [
    ['A4:C6', 'Total contacts', '=COUNTA(Network!A:A)-1'],
    ['D4:F6', 'Active · 30 days', '=COUNTIFS(Network!P:P,">="&TODAY()-30)'],
    ['G4:I6', 'Active · 90 days', '=COUNTIFS(Network!P:P,">="&TODAY()-90)'],
    ['J4:L6', 'You never replied', '=COUNTIF(Network!R:R,"you never replied")'],
    ['M4:N6', 'No reply from them', '=COUNTIF(Network!R:R,"no reply from them")']
  ] as const
  for (const [range, label, formula] of cards) {
    dashboard.mergeCells(range)
    const cell = dashboard.getCell(range.split(':')[0])
    cell.value = { formula }
    cell.font = { name: 'Aptos Display', size: 22, bold: true, color: { argb: 'FF1D1D1F' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F7' } }
    cell.alignment = { horizontal: 'center', vertical: 'center' }
    const start = range.split(':')[0]
    const labelCell = dashboard.getCell(Number(start.match(/\d+/)?.[0] || 4) - 1, dashboard.getColumn(start.replace(/\d/g, '')).number)
    labelCell.value = label
    labelCell.font = { name: 'Aptos', size: 9, color: { argb: 'FF6E6E73' } }
  }

  const categories = tally(rows.map(row => row.category), 1, 12)
  const companies = tally(rows.map(row => row.company), 2, 12)
  const roles = tally(rows.map(row => row.role), 1, 12)
  const years = tally(rows.map(row => row.lastMessageAt ? String(row.lastMessageAt.getFullYear()) : ''), 1, 12).sort((a, b) => a[0].localeCompare(b[0]))
  const chartData = [
    ['Category breakdown', categories, 'A9', 'G24'],
    ['Companies with 2+ contacts', companies, 'H9', 'N24'],
    ['Top roles', roles, 'A26', 'G41'],
    ['Last contact by year', years, 'H26', 'N41']
  ] as const
  for (const [title, entries, start, end] of chartData) {
    const dataUrl = chartPng(title, entries)
    if (!dataUrl) continue
    const imageId = workbook.addImage({ base64: dataUrl, extension: 'png' })
    dashboard.addImage(imageId, { tl: { col: dashboard.getColumn(start.replace(/\d/g, '')).number - 1, row: Number(start.match(/\d+/)?.[0] || 1) - 1 }, br: { col: dashboard.getColumn(end.replace(/\d/g, '')).number, row: Number(end.match(/\d+/)?.[0] || 1) } })
  }

  dashboard.mergeCells('A43:N43')
  dashboard.getCell('A43').value = 'Sync coverage'
  dashboard.getCell('A43').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: 'FF1D1D1F' } }
  dashboard.mergeCells('A44:N50')
  const failedContacts = coverage.failedContacts.map(row => `${row.name}: ${row.error}`).join('; ')
  const failedGroups = coverage.failedGroups.map(row => `${row.name}: ${row.error}`).join('; ')
  dashboard.getCell('A44').value = [
    coverage.firstMessageAt && coverage.lastMessageAt ? `Pulled message range: ${coverage.firstMessageAt} to ${coverage.lastMessageAt}.` : 'Message date coverage could not be fully established.',
    coverage.partialContacts ? `${coverage.partialContacts} contact thread(s) remain partial.` : 'All fetched private threads reached their available start.',
    failedContacts ? `Failed chats: ${failedContacts}.` : '',
    failedGroups ? `Group participant gaps: ${failedGroups}.` : '',
    coverage.note || ''
  ].filter(Boolean).join(' ')
  dashboard.getCell('A44').alignment = { wrapText: true, vertical: 'top' }
  dashboard.getCell('A44').font = { name: 'Aptos', size: 10, color: { argb: 'FF6E6E73' } }

  const excludedSheet = workbook.addWorksheet('Excluded', { views: [{ state: 'frozen', ySplit: 1 }] })
  excludedSheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Username', key: 'username', width: 22 },
    { header: 'Telegram User ID', key: 'telegramUserId', width: 18 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Reason', key: 'reason', width: 28 },
    { header: 'Group', key: 'groupName', width: 30 },
    { header: 'Last Message', key: 'lastMessageAt', width: 20 }
  ]
  setHeader(excludedSheet.getRow(1))
  excluded.forEach(row => excludedSheet.addRow({ ...row, lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt * 1000) : null }))
  excludedSheet.autoFilter = { from: 'A1', to: `G${Math.max(1, excludedSheet.rowCount)}` }
  excludedSheet.getColumn('lastMessageAt').numFmt = 'yyyy-mm-dd hh:mm'

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `telegram-network-crm-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
