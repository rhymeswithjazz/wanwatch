import { PrismaClient } from '@/prisma/generated/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import path from 'path'

function getDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./wanwatch.db'
  // Convert Prisma URL format (file:./path) to actual file path
  let dbPath = dbUrl.replace(/^file:/, '')

  // If it's a relative path starting with ./, resolve it relative to the prisma folder
  // (matching Prisma v6 behavior where paths are relative to schema location)
  if (dbPath.startsWith('./')) {
    dbPath = path.join(process.cwd(), 'prisma', dbPath.substring(2))
  }

  return dbPath
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: getDatabasePath() })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
