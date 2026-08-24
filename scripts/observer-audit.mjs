import fs from 'node:fs'
import path from 'node:path'

function collect(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...collect(full))
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(full)
  }
  return files
}

const violations = []
const rootMarginLiteral = /rootMargin\s*:\s*['"`]([^'"`]+)['"`]/g

for (const file of collect('src')) {
  const source = fs.readFileSync(file, 'utf8')
  let match
  while ((match = rootMarginLiteral.exec(source))) {
    const margin = match[1]
    const tokens = margin.trim().split(/\s+/)
    for (const token of tokens) {
      if (/^[-+]?\d*\.?\d+(?:px|%)$/.test(token) || token === '0') continue
      violations.push(`${file}: invalid IntersectionObserver rootMargin token "${token}" in "${margin}"`)
    }
  }
}

if (violations.length) {
  console.error('IntersectionObserver audit failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('IntersectionObserver audit passed.')
