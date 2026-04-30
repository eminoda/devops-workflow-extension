/**
 * 企微群机器人文档：https://developer.work.weixin.qq.com/document/path/99110
 */
export async function sendWecomMarkdown(webhook: string, markdown: string): Promise<void> {
  if (!webhook?.trim()) return
  const res = await fetch(webhook.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: { content: markdown },
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`企微通知失败: ${res.status} ${t.slice(0, 200)}`)
  }
  const j = (await res.json().catch(() => ({}))) as { errcode?: number; errmsg?: string }
  if (j.errcode != null && j.errcode !== 0) {
    throw new Error(`企微: ${j.errcode} ${j.errmsg ?? ''}`)
  }
}
