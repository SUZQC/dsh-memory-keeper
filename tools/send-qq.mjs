#!/usr/bin/env node
// send-qq.mjs —— 主动往 QQ 群 / 私聊发一条消息（官方机器人 API）
//
// 用法：
//   node send-qq.mjs group <群名或group_openid> "内容"
//   node send-qq.mjs c2c   <openid>            "内容"
//   node send-qq.mjs group <群名> "内容" --dry     ← 只打印，不发
//
// 说明：
// - 凭证读 dsh-msg-hub 的 state/qq/accounts.json（appId/appSecret）
// - 群名 → openid 的对照读 workspace\群聊\索引\群清单.md
// - 群聊主动消息要求群主在群设置开「机器人主动在群聊内发言」

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = process.env.DSH_PROFILE_DIR || join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'desktop')
const HUB = join(PROFILE, 'node_modules', 'dsh-msg-hub')
const ACCOUNTS = join(HUB, 'state', 'qq', 'accounts.json')
const WORKSPACE = process.env.DSH_WORKSPACE || 'E:\\DS House\\workspace'
const GROUP_LIST = join(WORKSPACE, '群聊', '索引', '群清单.md')

function die(msg) {
  console.error('[ERR] ' + msg)
  process.exit(1)
}

const [, , kind, target, ...rest] = process.argv
const dry = rest.includes('--dry')
const text = rest.filter((x) => x !== '--dry').join(' ')
if (!kind || !target || !text) {
  console.log('用法: node send-qq.mjs group|c2c <目标> "内容" [--dry]')
  process.exit(2)
}

function resolveGroup(nameOrId) {
  if (!existsSync(GROUP_LIST)) return nameOrId
  const raw = readFileSync(GROUP_LIST, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const cols = line.split('|').map((s) => s.trim())
    if (cols.length >= 4 && (cols[2] === nameOrId || cols[1] === nameOrId)) return cols[1]
  }
  return nameOrId
}

const cfg = JSON.parse(readFileSync(ACCOUNTS, 'utf8'))[0]
if (!cfg?.appId || !cfg?.appSecret) die('accounts.json 缺 appId/appSecret')

const id = kind === 'group' ? resolveGroup(target) : target
const url =
  kind === 'group'
    ? `https://api.sgroup.qq.com/v2/groups/${id}/messages`
    : `https://api.sgroup.qq.com/v2/users/${id}/messages`

const body = JSON.stringify({ content: text, msg_type: 0, msg_seq: Math.floor(Math.random() * 100000) + 1 })

if (dry) {
  console.log('[DRY] ' + kind + ' → ' + id)
  console.log('[DRY] body = ' + body)
  process.exit(0)
}

const tr = await fetch('https://bots.qq.com/app/getAppAccessToken', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ appId: cfg.appId, clientSecret: cfg.appSecret }),
})
const tj = await tr.json()
const token = tj.access_token
if (!token) die('取 token 失败: ' + JSON.stringify(tj).slice(0, 200))

const r = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `QQBot ${token}`,
    'Content-Type': 'application/json',
    'X-Union-Appid': cfg.appId,
  },
  body,
})
const t = await r.text()
if (r.ok) {
  console.log(`[OK] ${kind}→${id} HTTP ${r.status} ${t.slice(0, 120)}`)
} else {
  console.error(`[FAIL] ${kind}→${id} HTTP ${r.status} ${t.slice(0, 200)}`)
  process.exit(1)
}
