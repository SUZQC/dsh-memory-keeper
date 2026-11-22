#!/usr/bin/env node
// sync-session-log.mjs —— 把 DSH 会话日志同步成 markdown
//   产物 1：<workspace>\对话记录\YYYY-MM\YYYY-MM-DD.md  （原文层，chat_search 直接读）
//   产物 2：<workspace>\memory\12-进行中.auto.md        （最近几天的原话摘录，供新会话开场读）
// 用法：node sync-session-log.mjs ["工作区路径"] [天数]
// 幂等：同一天重复跑，只替换它自己写的那一段，不动手工内容。

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import zlib from 'node:zlib'

const WORKSPACE = process.argv[2] || 'F:\\DS House\\workspace'
const DAYS = Number(process.argv[3] || 3)
const SESSION_ROOT = join(homedir(), '.dsh', 'sessions')
const TZ = 'Asia/Shanghai'
const MARK = 'DSH 会话日志'

const fmtStamp = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const fmtDate = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

function encodeSessionDir(ws) {
  const s = String(ws).replace(/:/g, '').replace(/[\\/]/g, '-')
  let out = ''
  for (const ch of s) out += /[A-Za-z0-9-]/.test(ch) ? ch : '~' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
  return '--' + out + '--'
}

const ZSTD = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const safeParse = (l) => { try { return JSON.parse(l) } catch { return null } }

function decode(file) {
  const buf = readFileSync(file)
  let text = ''
  if (file.endsWith('.zstd')) {
    const idx = []
    let i = 0
    while ((i = buf.indexOf(ZSTD, i)) >= 0) { idx.push(i); i += 4 }
    if (!idx.length) return []
    const parts = []
    for (let k = 0; k < idx.length; k++) {
      const start = idx[k]
      const end = k + 1 < idx.length ? idx[k + 1] : buf.length
      try { parts.push(zlib.zstdDecompressSync(buf.subarray(start, end))) } catch { /* 半截帧跳过 */ }
    }
    text = Buffer.concat(parts).toString('utf8')
  } else {
    text = buf.toString('utf8')
  }
  return text.split('\n').filter(Boolean).map(safeParse).filter(Boolean)
}

const NOISE = [
  /^This is an automatically generated checkpoint/, /^## Primary Request and Intent/,
  /^# 上下文压缩/, /^<environment/, /^<system-reminder>/, /^Current runtime context\./,
  /^Time sampled while preparing/, /^Agent [0-9a-f]{8}-/,
  /^Background subagent/, /^Its closing message:/, /finished and will do no further work/,
]
const isNoise = (t) => NOISE.some((re) => re.test(t.trim()))
// 内容没变就不写：避免「没有新内容却刷新了时间戳」
function writeIfChanged(file, content) {
  try {
    if (existsSync(file)) {
      const old = readFileSync(file, 'utf8')
      if (old === content) return false
    }
  } catch { /* 读不到就当要写 */ }
  writeFileSync(file, content, 'utf8')
  return true
}

function textOf(m) {
  const c = m && m.content
  if (Array.isArray(c)) return c.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n').trim()
  if (typeof c === 'string') return c.trim()
  return ''
}

// ---- 收集 ----
const dir = join(SESSION_ROOT, encodeSessionDir(WORKSPACE))
if (!existsSync(dir)) { console.error('找不到会话目录：' + dir); process.exit(1) }

const floor = Date.now() - DAYS * 86400000
const messages = []
const seen = new Set()
let sessionCount = 0

for (const sub of readdirSync(dir, { withFileTypes: true })) {
  if (!sub.isDirectory()) continue
  const sd = join(dir, sub.name)
  let files = []
  try { files = readdirSync(sd) } catch { continue }
  for (const f of files) {
    if (!/\.jsonl(\.zstd)?$/.test(f)) continue
    const p = join(sd, f)
    try { if (statSync(p).mtimeMs < floor) continue } catch { continue }
    sessionCount++
    for (const r of decode(p)) {
      if (r.type !== 'user/message' && r.type !== 'assistant/message') continue
      if (typeof r.time !== 'number' || typeof r.seq !== 'number') continue
      if (r.time < floor) continue
      const t = (textOf(r.data && r.data.message) || textOf(r.data) || '').trim()
      if (t.length < 4 || isNoise(t)) continue
      const key = (r.type === 'user/message' ? 'U' : 'A') + '|' + t.replace(/\s+/g, ' ').slice(0, 80)
      if (seen.has(key)) continue
      seen.add(key)
      messages.push({ seq: r.seq, time: r.time, date: fmtDate.format(r.time), hm: fmtStamp.format(r.time).slice(11, 16), role: r.type === 'user/message' ? '他' : '我', text: t })
    }
  }
}
messages.sort((a, b) => a.time - b.time || a.seq - b.seq)

if (!messages.length) { console.log('最近 ' + DAYS + ' 天没有会话消息，无事可做。'); process.exit(0) }

// ---- 产物 1：原文层 ----
const byDate = new Map()
for (const m of messages) {
  if (!byDate.has(m.date)) byDate.set(m.date, [])
  byDate.get(m.date).push(m)
}
let dayFiles = 0
let changed = 0
for (const [date, list] of byDate) {
  const dirp = join(WORKSPACE, '对话记录', date.slice(0, 7))
  mkdirSync(dirp, { recursive: true })
  const file = join(dirp, date + '.md')
  const block = []
  for (const m of list) {
    block.push('**' + m.hm + ' [' + m.role + ']**')
    block.push('')
    block.push(m.text.replace(/^#+\s*/gm, '').replace(/^[-=*═─]{3,}$/gm, '').trim())
    block.push('')
  }
  const header = '**00:00 [《' + MARK + '》]**'
  const section = [header, '', ...block].join('\n')

  if (existsSync(file)) {
    const old = readFileSync(file, 'utf8')
    const at = old.indexOf(header)
    const prefix = at >= 0 ? old.slice(0, at).replace(/\s+$/, '') : old.replace(/\s+$/, '')
    if (writeIfChanged(file, prefix + '\n\n' + section)) changed++
  } else {
    if (writeIfChanged(file, '# ' + date + '\n\n' + section)) changed++
  }
  dayFiles++
}

// ---- 产物 2：交接摘录 ----
const auto = []
auto.push('# 进行中 · 自动摘录')
auto.push('')
auto.push('> 由 `tools/sync-session-log.mjs` 自动生成，**不要手改**（下次会覆盖）。')
auto.push('> 生成于 ' + fmtStamp.format(Date.now()).replace('T', ' ') + ' · 覆盖最近 ' + DAYS + ' 天')
auto.push('> 这是「原料」，不是判断。判断写 `12-进行中.md`。')
auto.push('')
let curDate = ''
for (const m of messages) {
  if (m.role !== '他') continue
  if (m.date !== curDate) { curDate = m.date; auto.push(''); auto.push('## ' + curDate); auto.push('') }
  const one = m.text.replace(/\s+/g, ' ').slice(0, 140)
  auto.push('- ' + m.hm + ' · ' + one)
}
const autoFile = join(WORKSPACE, 'memory', '12-进行中.auto.md')
mkdirSync(join(WORKSPACE, 'memory'), { recursive: true })
if (writeIfChanged(autoFile, auto.join('\n') + '\n')) changed++

console.log('会话文件 ' + sessionCount + ' 个 · 消息 ' + messages.length + ' 条')
console.log('原文层：' + dayFiles + ' 天 → ' + join(WORKSPACE, '对话记录'))
console.log('摘录：' + autoFile)
console.log(changed === 0 ? '无新内容，未改动任何文件' : ('改动 ' + changed + ' 个文件'))