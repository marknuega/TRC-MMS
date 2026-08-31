/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Activation: this build stops working 120 days after it is activated, and
 * needs a new key from the developer to continue. This is not copy
 * protection against a determined attacker — it is a tripwire. A copy of the
 * installer handed out (or lost, or leaked) without the developer's
 * knowledge runs for at most 120 days before its holder has no choice but to
 * come back and ask for another key, which is the moment an install nobody
 * told the developer about becomes one they know about.
 *
 * Verification only — this module can check a key, never produce one. Only
 * PUBLIC_KEY_PEM below ships in the installer; the matching private key
 * (see scripts/license-keygen.mjs) never does, so nobody who has the app can
 * mint their own activation keys from it, however far they take it apart.
 *
 * A key is  base64url(installationId|expiresAtISO) + "." + base64url(signature)
 * — see scripts/issue-license.mjs, which is the only thing that ever writes
 * one. Binding the installation ID in means a key handed to one machine is
 * inert on every other: the app refuses a key that does not name ITS OWN id.
 */
import { createPublicKey, verify } from 'node:crypto'

// Safe to ship — this can only verify a signature, never create one. Keep in
// sync with desktop/license-public-key.pem (scripts/license-keygen.mjs writes
// both; this constant is a manual copy because the .pem file itself is not
// bundled into the installer — see package.json's build.files).
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfLhYxatvG/0mT3tuNPRFHOPmemaMSZZANZ0y28jtXV0=
-----END PUBLIC KEY-----
`

const publicKey = createPublicKey(PUBLIC_KEY_PEM)

const DAY_MS = 86_400_000
// How long an issued key is meant to run — informational only (the actual
// limit is whatever expiresAt the key itself carries, which issue-license.mjs
// sets from this same number by default). Surfaced so the UI can say "120
// days" without that number living in two places.
export const ACTIVATION_PERIOD_DAYS = 120
// Start warning this many days before expiry, so a technician mid-report is
// never the first person to learn the license is about to lapse.
export const WARN_WITHIN_DAYS = 14

/**
 * Verify an activation key against THIS install's own id.
 * @returns {{ ok: true, expiresAt: string } | { ok: false, error: string }}
 */
export function verifyLicenseKey(rawKey, deviceTag) {
  const key = String(rawKey ?? '').trim()
  const dot = key.indexOf('.')
  if (dot < 1 || dot === key.length - 1) return { ok: false, error: 'That does not look like an activation key.' }
  let payload, signature
  try {
    payload = Buffer.from(key.slice(0, dot), 'base64url')
    signature = Buffer.from(key.slice(dot + 1), 'base64url')
  } catch {
    return { ok: false, error: 'That does not look like an activation key.' }
  }
  if (!payload.length || !signature.length) return { ok: false, error: 'That does not look like an activation key.' }

  // Signature checked BEFORE the content is trusted for anything — this is
  // the only line standing between "any string" and "a key this app acts on".
  let validSignature = false
  try {
    validSignature = verify(null, payload, publicKey, signature)
  } catch {
    validSignature = false
  }
  if (!validSignature) return { ok: false, error: 'This activation key is not valid.' }

  const bar = payload.toString('utf8').indexOf('|')
  if (bar < 1) return { ok: false, error: 'This activation key is not valid.' }
  const tag = payload.subarray(0, bar).toString('utf8')
  const expiresAt = payload.subarray(bar + 1).toString('utf8')

  if (tag.toUpperCase() !== String(deviceTag ?? '').toUpperCase()) {
    return { ok: false, error: `This key was issued for installation ${tag} — this one is ${deviceTag}.` }
  }
  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return { ok: false, error: 'This activation key is not valid.' }

  return { ok: true, expiresAt: expiry.toISOString() }
}

/** Days remaining, rounded up so "expires later today" reads as 1, not 0. */
export function daysRemaining(expiresAtIso) {
  return Math.ceil((new Date(expiresAtIso).getTime() - Date.now()) / DAY_MS)
}

export const isExpired = (expiresAtIso) => !expiresAtIso || new Date(expiresAtIso).getTime() <= Date.now()
