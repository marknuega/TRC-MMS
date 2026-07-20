import express from 'express'
import { prisma } from './db.js'
import reportsRouter from './routes/reports.js'

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

// Any error thrown in a route lands here. Never leak stack traces in production.
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  })
})
