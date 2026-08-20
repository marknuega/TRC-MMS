import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Every build gets an identity, so "is this the current code or an old bundle?"
// is a question you can answer by looking rather than by guessing. It is shown
// in the app footer, in the desktop app's Help -> About, and served at
// /api/version so a running tab can notice it has fallen behind a deploy.
//
// Stale bundles are the recurring bug this exists to kill: the calculation rules
// live in client/src/report.js, so a stale client is not a cosmetic problem —
// it silently produces different numbers from the same data.
function commitSha() {
  // A local checkout: ask git, and say so when the tree is dirty — a hand-tested
  // build is otherwise indistinguishable from the commit someone else can check
  // out under the same name.
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return dirty ? `${sha}-dirty` : sha
  } catch {
    // Not a git checkout. CI builders usually are not: Railway builds from a
    // source snapshot with no .git directory, which is why the first deploy of
    // this stamp came out as "nogit" and could not name its own commit. The
    // platform passes the sha in the environment instead.
    const fromEnv =
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.SOURCE_COMMIT ||
      process.env.GITHUB_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA
    return fromEnv ? fromEnv.slice(0, 7) : 'nogit'
  }
}

function buildId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13) // 20260820T1401
  return `${stamp}-${commitSha()}`
}

const BUILD_ID = process.env.BUILD_ID || buildId()

// Written into dist/ so the SERVER can report which client it is serving. The
// client carries the same string compiled in, and comparing the two is what
// detects a tab left open across a deploy.
function buildStamp() {
  return {
    name: 'trc-build-stamp',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build.json',
        source: JSON.stringify({ buildId: BUILD_ID, builtAt: new Date().toISOString() }, null, 2),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildStamp()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    port: 5173,
    // Forward /api/* and the public /codemap mirror to the local Express server
    // so the browser sees one origin. Avoids CORS entirely in development.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/codemap': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
