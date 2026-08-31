/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Run ONCE, by the developer only, on a machine you trust — never in CI, never
 * on a machine that ships builds to anyone else.
 *
 *   node scripts/license-keygen.mjs
 *
 * Writes two files next to this script's parent (desktop/):
 *   license-private-key.pem   — KEEP THIS SECRET. Used to ISSUE activation
 *                                keys (see issue-license.mjs). Never commit
 *                                it, never put it in the installer, never
 *                                send it to anyone. Losing it means every
 *                                install already out there can still be
 *                                reactivated by hand once you generate a new
 *                                pair and re-issue — but you would have to
 *                                rebuild and redistribute the app with the
 *                                new PUBLIC key first, since the old installs
 *                                only trust the old one.
 *   license-public-key.pem    — safe to embed in the app (see license.js).
 *                                It can only VERIFY a signature, never
 *                                produce one.
 *
 * Ed25519 rather than RSA: a 32-byte key, a 64-byte signature, and node's
 * built-in crypto verifies it with no extra dependency — the whole point of
 * doing this offline, in an app that promises to contact nothing.
 */
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const privPath = join(here, '..', 'license-private-key.pem')
const pubPath = join(here, '..', 'license-public-key.pem')

if (existsSync(privPath)) {
  console.error(`${privPath} already exists — refusing to overwrite it.`)
  console.error('Generating a new pair invalidates every activation key issued under the old one.')
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }), 'utf8')

console.log(`Wrote ${privPath}`)
console.log(`Wrote ${pubPath}`)
console.log('')
console.log('Next steps:')
console.log('  1. Move license-private-key.pem somewhere safe OUTSIDE this repo (it is')
console.log('     gitignored here as a backstop, but do not rely on that alone).')
console.log('  2. Paste the contents of license-public-key.pem into the PUBLIC_KEY_PEM')
console.log('     constant in desktop/license.js, then rebuild the installer.')
