import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from './db.js'
import reportsRouter from './routes/reports.js'
import optionsRouter from './routes/options.js'
import savedReportsRouter from './routes/savedReports.js'
import monthlyRouter from './routes/monthly.js'
import inventoryRouter from './routes/inventory.js'

const here = path.dirname(fileURLToPath(import.meta.url)) // server/src
const clientDist = path.resolve(here, '../../client/dist') // repo/client/dist

// The app is built here but NOT started, so tests can import it
// without binding a port. src/index.js is what actually listens.
export const app = express()

app.use(express.json())

// Railway hits this to decide whether a deploy is healthy.
// Keep it cheap and dependency-free so a slow DB never fails the deploy.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// Separate check for when you actually want to know the DB is reachable.
app.get('/health/db', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({ status: 'ok', database: 'connected' })
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable', message: err.message })
  }
})

app.use('/api/reports', reportsRouter)
app.use('/api/options', optionsRouter)
app.use('/api/saved-reports', savedReportsRouter)
app.use('/api/monthly', monthlyRouter)
app.use('/api/inventory', inventoryRouter)

// In production the same service also serves the built React app, so the
// browser sees one origin (no CORS). In dev, Vite serves the client instead.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist))
  // SPA fallback: any non-API GET returns index.html.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// Any error thrown in a route lands here. Never leak stack traces in production.
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  })
})
