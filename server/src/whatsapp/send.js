/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

// Thin wrapper around Meta's WhatsApp Cloud API — fetch only, no SDK.

const GRAPH_BASE = 'https://graph.facebook.com'

// Meta rejects a text body over 4096 characters outright, so a long reply must
// be split rather than sent and lost. Kept a little under the limit to leave
// room for the part marker.
const MAX_BODY = 3900

const apiUrl = () =>
  `${GRAPH_BASE}/${process.env.WA_API_VERSION || 'v25.0'}/${process.env.WA_PHONE_NUMBER_ID}/messages`

/**
 * Send a plain text WhatsApp message, splitting anything over Meta's limit.
 * @param {string} to recipient in international format without "+" (e.g. "966511535949")
 * @param {string} body message text
 */
export async function sendText(to, body) {
  const chunks = splitBody(String(body ?? ''))
  const sent = []
  for (const chunk of chunks) sent.push(await postText(to, chunk))
  return sent.length === 1 ? sent[0] : sent
}

async function postText(to, body) {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[whatsapp] send failed:', JSON.stringify(data))
    throw new Error(data?.error?.message || 'WhatsApp send failed')
  }
  return data
}

/**
 * Split on line boundaries where possible, so a report never breaks mid-row.
 * Falls back to a hard cut only for a single line longer than the limit.
 */
export function splitBody(text) {
  if (text.length <= MAX_BODY) return [text]

  const parts = []
  let current = ''
  for (const line of text.split('\n')) {
    if (line.length > MAX_BODY) {
      if (current) { parts.push(current); current = '' }
      for (let i = 0; i < line.length; i += MAX_BODY) parts.push(line.slice(i, i + MAX_BODY))
      continue
    }
    if (current.length + line.length + 1 > MAX_BODY) {
      parts.push(current)
      current = line
    } else {
      current = current ? `${current}\n${line}` : line
    }
  }
  if (current) parts.push(current)

  return parts.map((p, i) => `(${i + 1}/${parts.length})\n${p}`)
}
