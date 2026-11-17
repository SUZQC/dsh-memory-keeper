// 纯逻辑单测：node test-router.mjs
import assert from 'node:assert/strict'
import { classify } from './lib/router.js'

const cases = [
  ['session-99dbd51e-9f01-4425-b351-acdfe1043b9e', 'personal', '本地 DSH 会话（UUID）'],
  ['onebot-private-123456', 'personal', 'lanxi 私聊'],
  ['onebot-group-789012', 'group', 'lanxi 群聊'],
  ['ch-qq-c2c-abc', 'personal', 'msg-hub 私聊'],
  ['ch-qq-group-789012-abc', 'group', 'msg-hub 群聊'],
  ['ch-weixin-group-1', 'group', '微信群'],
  ['private:123', 'personal', 'peerId 私聊'],
  ['group:456', 'group', 'peerId 群聊'],
  ['', 'personal', '空 id 兜底'],
  [null, 'personal', 'null 兜底'],
  [undefined, 'personal', 'undefined 兜底'],
  ['code:repo-a', 'code', '代码模式（30 章）'],
]

let failed = 0
for (const [id, want, note] of cases) {
  const got = classify(id)
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(id).padEnd(48)} → ${got.padEnd(8)} (${note})`)
}
console.log(failed ? `\n${failed} failed` : `\nall ${cases.length} passed`)
assert.equal(failed, 0)
