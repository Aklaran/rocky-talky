import { PrismaClient } from '@prisma/client'

// Module-level singleton. Repositories import this directly —
// they do NOT receive the full tRPC context.
export const prisma = new PrismaClient()
