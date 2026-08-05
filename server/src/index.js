/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import { app } from './app.js'
import { seedAdmin } from './auth.js'

// Railway injects PORT. Hardcoding it makes the deploy look healthy but be unreachable.
const port = process.env.PORT || 3000

// Make sure a starting admin exists (non-fatal if the DB is briefly unavailable).
seedAdmin().catch((err) => console.error('seedAdmin failed:', err.message))

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port} (${process.env.NODE_ENV || 'development'})`)
})
