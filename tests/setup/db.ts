/**
 * Database test helpers — reset state between tests.
 */
import { prisma } from '@backend/lib/clients/prisma'

/**
 * Truncate all app tables (not session — that's managed by connect-pg-simple).
 * Call in beforeEach or afterEach to isolate tests.
 *
 * Order matters: delete children before parents (foreign keys).
 */
export async function resetDb() {
  await prisma.message.deleteMany()
  await prisma.conversation.deleteMany()
  await prisma.user.deleteMany()
}

/**
 * Disconnect Prisma — call in afterAll.
 */
export async function disconnectDb() {
  await prisma.$disconnect()
}

export { prisma }
