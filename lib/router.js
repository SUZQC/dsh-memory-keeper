// 会话分派：只认 session.id 前缀，不认插件名。
// 规则表是以后唯一要维护的东西；换通讯插件只加一行。
// 依据：改造 10 §1 / 12 P1-1 / 40 §1。
//
// 2026-11-24 起多一档 guest（朋友私聊）：
//   「私聊」不等于「主人」。c2c / private 通道的会话要看 id 里有没有主人的 openid，
//   没有就是朋友在跟她私聊，读不到主人记忆，也不写主人日记。
//   ownerOpenIds 留空时不做区分（全部按主人处理），保持旧行为。

export const RULES = [
  { test: /^onebot-group-/, kind: 'group' },
  { test: /^onebot-private-/, kind: 'personal', guest: true },
  { test: /^ch-qq-group-/, kind: 'group' },
  { test: /^ch-qq-c2c[: -]/, kind: 'personal', guest: true },
  { test: /^ch-qq-group[: -]/, kind: 'group' },
  { test: /^ch-weixin-group-/, kind: 'group' },
  { test: /^ch-weixin-c2c-/, kind: 'personal', guest: true },
  // 40 §1 里的 peerId 形状（有些通道直接把 peerId 当 session 后缀）
  { test: /^group:/, kind: 'group' },
  { test: /^private:/, kind: 'personal', guest: true },
  { test: /^c2c:/, kind: 'personal', guest: true },
]

/** personal（主人）| guest（朋友私聊）| group | code */
export function classify(sessionId, ownerOpenIds = []) {
  const id = String(sessionId ?? '')
  if (id.startsWith('code:')) return 'code'
  const owners = (Array.isArray(ownerOpenIds) ? ownerOpenIds : [])
    .map((s) => String(s || '').trim()).filter(Boolean)
  for (const rule of RULES) {
    if (!rule.test.test(id)) continue
    if (rule.kind === 'group') return 'group'
    // 只有 c2c/private 通道可能降级成 guest；本地 session-* 永远是主人
    if (rule.guest && owners.length && !owners.some((o) => id.includes(o))) return 'guest'
    return 'personal'
  }
  // 本地 DSH 会话是 session-<uuid>；默认按个人处理，保持现状行为
  return 'personal'
}

export function isGroup(sessionId) {
  return classify(sessionId) === 'group'
}

/** 从私聊会话 id 里取对方的 openid / QQ 号；取不到返回空 */
export function peerIdOf(sessionId) {
  const id = String(sessionId ?? '')
  const m = id.match(/^(?:ch-qq-c2c|ch-weixin-c2c|onebot-private|private|c2c)[:\-]?(.+)$/)
  return m ? m[1] : ''
}
