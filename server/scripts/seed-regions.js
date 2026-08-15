/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * One-time (but idempotent) setup for the Region/Director access-control
 * tier: appends the new branch names this feature introduces to
 * AppOptions.data.branches, and adds the 4 named regions to
 * AppOptions.data.regions.
 *
 * Never replaces the whole AppOptions row — only object-spreads onto it, so
 * every other admin-managed list (technicians, materials, agencies, ...) is
 * left untouched. Safe to run more than once: a branch already present
 * (case-insensitive) is not duplicated, and a region already present is only
 * ever re-set to the same membership list, never removed.
 *
 * Usage (from server/, with DATABASE_URL pointed at the real database):
 *   node scripts/seed-regions.js
 */
import { prisma } from '../src/db.js'

const NEW_BRANCHES = ['Tabuk', 'Al-Jawf', 'Hail', 'Asir', 'Jazan', 'Baha', 'Najran', 'Al Khobar', 'Dhahran']

const REGIONS = {
  'Western Region': ['Makkah', 'Jeddah', 'Taif'],
  'Northern Region': ['Tabuk', 'Al-Jawf', 'Hail'],
  'Southern Region': ['Asir', 'Jazan', 'Baha', 'Najran'],
  'Eastern Region': ['Dammam', 'Al Khobar', 'Dhahran'],
}

async function main() {
  const row = await prisma.appOptions.findUnique({ where: { id: 1 } })
  const data = row?.data ?? {}

  const branches = [...(data.branches ?? [])]
  const added = []
  for (const b of NEW_BRANCHES) {
    if (!branches.some((existing) => String(existing).toLowerCase() === b.toLowerCase())) {
      branches.push(b)
      added.push(b)
    }
  }

  const regions = { ...(data.regions ?? {}), ...REGIONS }

  await prisma.appOptions.upsert({
    where: { id: 1 },
    create: { id: 1, data: { ...data, branches, regions } },
    update: { data: { ...data, branches, regions } },
  })

  console.log(added.length ? `branches: added ${added.join(', ')}` : 'branches: nothing new to add')
  console.log(`regions: set ${Object.keys(REGIONS).join(', ')}`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
