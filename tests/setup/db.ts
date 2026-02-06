/**
 * Database test helpers — reset state between tests.
 */
import { prisma } from '@backend/lib/clients/prisma'

/**
 * Truncate all app tables (not session — that's managed by connect-pg-simple).
 * Call in beforeEach or afterEach to isolate tests.
 */
export async function resetDb() {
  await prisma.user.deleteMany()
}

/**
 * Disconnect Prisma — call in afterAll.
 */
export async function disconnectDb() {
  await prisma.$disconnect()
}

export { prisma }
