import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const textFiles = []
const skip = new Set(['node_modules','.git','dist'])
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(?:ts|tsx|js|mjs|cjs|html|json|md|env|example)$/.test(entry.name)||entry.name==='.env.example')textFiles.push(full)}}
walk(root)
const violations=[]
for(const file of textFiles){const rel=path.relative(root,file);if(rel==='scripts/byok-audit.mjs'||rel==='AUDIT_2026-08-27.md')continue;const text=fs.readFileSync(file,'utf8');if(/process\.env\.OPENAI_API_KEY|OPENAI_SUMMARY_MODEL/.test(text))violations.push(`${rel}: shared OpenAI server configuration`);if(/sessionStorage\.setItem\([^\n]*openai|localStorage\.setItem\([^\n]*openai/i.test(text))violations.push(`${rel}: persistent OpenAI key storage`)}
if(violations.length){console.error('BYOK privacy audit failed:\n'+violations.map(v=>`- ${v}`).join('\n'));process.exit(1)}
console.log(`BYOK privacy audit passed across ${textFiles.length} text files.`)
