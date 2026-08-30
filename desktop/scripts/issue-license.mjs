/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Run by the developer only, whenever a technician's 120-day activation is
 * due to expire (or on first install). Needs license-private-key.pem next to
 * this script's parent (desktop/) — see license-keygen.mjs.
 *
 * Usage:
 *   node scripts/issue-license.mjs <installation ID> [days]
 *
 * <installation ID> is the 4-character code shown in the requesting
 * technician's Help -> About (and on the activation screen itself). days
 * defaults to 120.
 *
 * Prints the activation key to paste back to them — over WhatsApp, email,
 * whatever reaches a machine that may have no internet of its own. The key
 * is meaningless on any installation but the one it was issued for: it signs
 * the installation ID in, and the app refuses a key issued for a different
 * one.
 */
import { createPrivateKey, sign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const privPath = join(here, '..', 'license-private-key.pem')

const [, , rawTag, rawDays] = process.argv
if (!rawTag) {
  console.error('Usage: node scripts/issue-license.mjs <installation ID> [days=120]')
  process.exit(1)
}
if (!existsSync(privPath)) {
  console.error(`${privPath} not found. Run license-keygen.mjs once, or restore your saved copy of it.`)
  process.exit(1)
}

const deviceTag = rawTag.trim().toUpperCase()
if (!/^[0-9A-F]{4}$/.test(deviceTag)) {
  console.error(`"${rawTag}" doesn't look like an installation ID (4 hex characters, e.g. 3F2A).`)
  process.exit(1)
}
const days = Number(rawDays) > 0 ? Number(rawDays) : 120

const privateKey = createPrivateKey(readFileSync(privPath))
const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
const payload = Buffer.from(`${deviceTag}|${expiresAt}`, 'utf8')
// Ed25519 signs the message directly — no separate digest step, unlike RSA/ECDSA.
const signature = sign(null, payload, privateKey)
const key = `${payload.toString('base64url')}.${signature.toString('base64url')}`

console.log(`Installation ID:  ${deviceTag}`)
console.log(`Valid until:       ${new Date(expiresAt).toLocaleString()} (${days} days)`)
console.log('')
console.log('Activation key:')
console.log(key)
