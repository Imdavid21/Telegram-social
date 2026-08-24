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
const staticRootMargin = /rootMargin\s*:\s*(['"])(.*?)\1/g
const templateRootMargin = /rootMargin\s*:\s*`([^`]*)`/g
const validStaticToken = /^[-+]?\d*\.?\d+(?:px|%)$|^0$/
const forbiddenUnit = /[-+]?\d*\.?\d+(?:vh|vw|vmin|vmax|rem|em|ch|ex|cm|mm|in|pt|pc)\b/i

for (const file of collect('src')) {
  const source = fs.readFileSync(file, 'utf8')
  let match

  while ((match = staticRootMargin.exec(source))) {
    const margin = match[2]
    const tokens = margin.trim().split(/\s+/)
    for (const token of tokens) {
      if (validStaticToken.test(token)) continue
      violations.push(`${file}: invalid IntersectionObserver rootMargin token "${token}" in "${margin}"`)
    }
  }

  while ((match = templateRootMargin.exec(source))) {
    const margin = match[1]
    // Runtime interpolation is allowed here because the observer receives resolved px values.
    // The audit only blocks CSS units that IntersectionObserver does not support.
    const forbidden = margin.match(forbiddenUnit)
    if (forbidden) {
      violations.push(`${file}: unsupported IntersectionObserver rootMargin unit in template "${margin}"`)
    }
  }
}

if (violations.length) {
  console.error('IntersectionObserver audit failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('IntersectionObserver audit passed.')
