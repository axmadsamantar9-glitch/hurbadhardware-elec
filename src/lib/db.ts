import { PrismaClient } from '@prisma/client'

// Prisma must be a singleton in development: Next.js hot-reload re-evaluates
// modules on every edit, and a fresh PrismaClient per reload exhausts the
// database connection pool within a few saves.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
