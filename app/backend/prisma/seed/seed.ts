import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Seed should not run in production')
    process.exit(1)
  }

  console.log('🌱 Seeding database...')

  // Create a demo user
  const passwordHash = await argon2.hash('password123')
  const user = await prisma.user.upsert({
    where: { email: 'demo@basecamp.dev' },
    update: {},
    create: {
      email: 'demo@basecamp.dev',
      passwordHash,
    },
  })
  console.log(`  ✓ Demo user: demo@basecamp.dev / password123`)

  // Create a sample conversation
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: 'Welcome to Basecamp',
      messages: {
        create: [
          {
            role: 'user',
            content: 'Hello! What can you help me with?',
          },
          {
            role: 'assistant',
            content:
              "Hi there! I'm your AI assistant. I can help you with a wide range of tasks — answering questions, brainstorming ideas, writing, coding, and more. What would you like to work on?",
          },
          {
            role: 'user',
            content: 'That sounds great. Let me think of something.',
          },
        ],
      },
    },
  })
  console.log(`  ✓ Sample conversation: "${conversation.title}" (${conversation.id})`)

  console.log('✅ Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
