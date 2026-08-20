// The offline desktop build runs this same server against SQLite, and generates
// its own Prisma client to do it — a client generated for one provider cannot
// talk to the other, and writing it to the default node_modules/.prisma/client
// would overwrite the Postgres one this repo uses everywhere else. So the
// desktop build sets PRISMA_CLIENT_URL to its own generated client (a file://
// URL, since it is an absolute path inside the packaged app) and everything
// else keeps importing the package normally.
const clientModule = process.env.PRISMA_CLIENT_URL || '@prisma/client'
const { PrismaClient } = await import(clientModule)

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
}

export const prisma = new PrismaClient()
