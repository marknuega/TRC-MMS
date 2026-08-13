/*
 * Software Developed by Muhammad Amir  MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 */

import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prisma } from './db.js'
import { loadUser, authRequired } from './auth.js'
import authRouter from './routes/auth.js'
import adminRouter from './routes/admin.js'
import reportsRouter from './routes/reports.js'
import optionsRouter from './routes/options.js'
import savedReportsRouter from './routes/savedReports.js'
import monthlyRouter from './routes/monthly.js'
import inventoryRouter from './routes/inventory.js'
import codemapRouter, { publicCodeMap } from './routes/codemap.js'
import whatsappRouter from './whatsapp/routes.js'

const here = path.dirname(fileURLToPath(import.meta.url)) // server/src
const clientDist = path.resolve(here, '../../client/dist') // repo/client/dist

// The app is built here but NOT started, so tests can import it
// without binding a port. src/index.js is what actually listens.
export const app = express()

// Behind Railway's proxy — needed so rate-limit sees the real client IP.
app.set('trust proxy', 1)

// Security headers. CSP is tuned for the Vite SPA this server also serves
// (same-origin scripts/styles; data: URIs for the select chevron + images).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        // The Code Reference page reads /codemap from this same origin — it
        // used to come from the standalone WhatsApp service, which is why this
        // once listed a second host.
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
)

// Bulk imports (inventory, saved reports) send sizeable JSON, so the cap is
// higher than the 10kb default — still bounded against abuse.
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())
// Attach req.user from the session cookie (anonymous if absent/invalid).
app.use(loadUser)

// General API rate limit. Branch users often share one office IP (one NAT), so
// the cap is generous and — crucially — SKIPS the auth endpoints, so a burst of
// data reads can never lock anyone out of signing in or checking their session.
app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    max: 1200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.originalUrl.startsWith('/api/auth'),
    message: { error: 'Too many requests. Slow down.' },
  }),
)

// Login-only limiter: guards against password brute-forcing without penalising a
// shared office IP — only FAILED logins count (skipSuccessfulRequests), so real
// sign-ins never trip it.
app.use(
  '/api/auth/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many failed login attempts. Try again in a few minutes.' },
  }),
)

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

// Public, CORS-open mirror of the code map. Deliberately unauthenticated and
// OUTSIDE /api: the WhatsApp bot reads it server-to-server with no session, and
// this is the exact path + shape it already consumes, so repointing the bot at
// this app is a URL change and nothing more. Registered before the SPA fallback
// so it is not swallowed by it.
app.get('/codemap', publicCodeMap)

// The WhatsApp webhook. Unauthenticated by necessity — Meta calls it with no
// session — and outside /api so the callback URL stays what Meta already knows.
// It authenticates itself two ways: the verification handshake checks
// WA_WEBHOOK_VERIFY_TOKEN, and WA_ALLOWED_SENDERS restricts which numbers can
// file anything.
//
// MUST be registered before the SPA fallback below: that fallback answers any
// unmatched GET with index.html, which would hand Meta HTML instead of the
// hub.challenge and fail verification.
app.use('/', whatsappRouter)

// Public auth endpoints (login, logout, me, credential request).
app.use('/api/auth', authRouter)
// Admin-only user + request management (guarded inside the router).
app.use('/api/admin', adminRouter)

// All data endpoints require a signed-in user.
app.use('/api/reports', authRequired, reportsRouter)
app.use('/api/options', authRequired, optionsRouter)
app.use('/api/saved-reports', authRequired, savedReportsRouter)
app.use('/api/monthly', authRequired, monthlyRouter)
app.use('/api/inventory', authRequired, inventoryRouter)
// Reading the map needs a session; editing it is admin-gated inside the router.
app.use('/api/codemap', authRequired, codemapRouter)

// In production the same service also serves the built React app, so the
// browser sees one origin (no CORS). In dev, Vite serves the client instead.
if (process.env.NODE_ENV === 'production') {
  app.use(
    express.static(clientDist, {
      // index.html is the pointer to the current build — it must always be
      // revalidated so a new deploy is picked up on the next load. The Vite
      // assets are content-hashed, so they can be cached forever.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache')
        } else if (/[.-][A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|svg|ico)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )
  // SPA fallback: any non-API GET returns index.html (never cached).
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next()
    res.setHeader('Cache-Control', 'no-cache')
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
