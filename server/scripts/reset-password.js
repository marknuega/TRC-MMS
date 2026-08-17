/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Set a user's password from the command line — the recovery path for an
 * account nobody can sign into any more. seedAdmin() cannot do this job: it
 * only ever CREATES the first admin and no-ops the moment one exists, so a
 * database whose admin forgot their password is beyond its reach.
 *
 * Changes nothing but the password hash. Role, branch and active flag are left
 * exactly as they are, so this cannot quietly promote anyone.
 *
 * The target database is printed before anything is written, because the only
 * thing separating a local reset from a production one is which DATABASE_URL
 * happens to be loaded — and that is worth seeing rather than assuming.
 *
 * Usage (from server/):
 *   npm run reset-password -- <username> <new-password>
 *
 * The password reaches this script as an argument, so it lands in the shell
 * history of whoever runs it. That is a fair trade for a rescue tool run by
 * hand on a machine its operator already controls — but treat the password as
 * burned: sign in with it and change it in the app.
 */
import { prisma } from '../src/db.js'
import { hashPassword } from '../src/auth.js'

// The app itself sets no minimum (routes/admin.js hashes whatever it is given).
// This script does, because it is the one place a password is chosen in a hurry
// by someone locked out — the moment a weak one is most tempting.
const MIN_LENGTH = 8

async function main() {
  const [username, password] = process.argv.slice(2)

  if (!username || !password) {
    console.error('Usage: npm run reset-password -- <username> <new-password>')
    process.exit(1)
  }
  if (password.length < MIN_LENGTH) {
    console.error(`Password must be at least ${MIN_LENGTH} characters.`)
    process.exit(1)
  }

  const { hostname, port, pathname } = new URL(process.env.DATABASE_URL)
  console.log(`Database: ${hostname}:${port}${pathname}`)

  // Exact match, like the login route (routes/auth.js) — so the name that works
  // here is the name that will work at the sign-in screen, capitals included.
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    const all = await prisma.user.findMany({ select: { username: true }, orderBy: { id: 'asc' } })
    console.error(`No user named "${username}". This database has: ${all.map((u) => u.username).join(', ') || '(none)'}`)
    process.exit(1)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  })

  console.log(`Password reset for "${user.username}" (${user.role}${user.branch ? `, ${user.branch}` : ''}).`)
  if (!user.active) console.log('Note: this account is INACTIVE — reactivate it in the app before it can sign in.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
