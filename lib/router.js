// 会话分派：只认 session.id 前缀，不认插件名。
// 规则表是以后唯一要维护的东西；换通讯插件只加一行。
// 依据：改造 10 §1 / 12 P1-1 / 40 §1。

export const RULES = [
  { test: /^onebot-group-/, kind: 'group' },
  { test: /^onebot-private-/, kind: 'personal' },
  { test: /^ch-qq-group-/, kind: 'group' },
  { test: /^ch-qq-c2c-/, kind: 'personal' },
  { test: /^ch-weixin-group-/, kind: 'group' },
  { test: /^ch-weixin-c2c-/, kind: 'personal' },
  // 40 §1 里的 peerId 形状（有些通道直接把 peerId 当 session 后缀）
  { test: /^group:/, kind: 'group' },
  { test: /^private:/, kind: 'personal' },
  { test: /^c2c:/, kind: 'personal' },
]

/** personal | group | code */
export function classify(sessionId) {
  const id = String(sessionId ?? '')
  if (id.startsWith('code:')) return 'code'
  for (const rule of RULES) if (rule.test.test(id)) return rule.kind
  // 本地 DSH 会话是 session-<uuid>；默认按个人处理，保持现状行为
  return 'personal'
}

export function isGroup(sessionId) {
  return classify(sessionId) === 'group'
}
