import { PrismaClient } from '@prisma/client'
import * as argon2 from 'argon2'

const prisma = new PrismaClient()

async function main() {
  // Rocky Talky: seed runs in all environments (single-user app, sample data is useful)
  console.log('🌱 Seeding database...')

  // Create a demo user (template code — kept but unused in Rocky Talky)
  const passwordHash = await argon2.hash('password123')
  const user = await prisma.user.upsert({
    where: { email: 'demo@basecamp.dev' },
    update: {},
    create: {
      email: 'demo@basecamp.dev',
      passwordHash,
    },
  })
  console.log(`  ✓ Demo user: demo@basecamp.dev / password123 (unused in Rocky Talky)`)

  // Create sample conversations (template code — kept but unused in Rocky Talky)
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
  console.log(
    `  ✓ Sample conversation: "${conversation.title}" (${conversation.id}) (template — unused)`,
  )

  // ========================================================================
  // Rocky Talky — Sample Sessions
  // ========================================================================

  console.log('\n🏔️  Creating Rocky Talky sample sessions...')

  // Session 1: Active session with messages
  const session1 = await prisma.session.create({
    data: {
      title: 'Welcome to Rocky Talky',
      tags: ['demo', 'welcome'],
      status: 'active',
      messages: {
        create: [
          {
            role: 'user',
            content: "Hey Rocky! What's the best way to organize a project?",
          },
          {
            role: 'assistant',
            content:
              "Great question! Here are some key principles:\n\n1. **Break it down** — Split large tasks into smaller, actionable steps\n2. **Prioritize** — Focus on what delivers value first\n3. **Stay flexible** — Be ready to adapt as you learn\n4. **Communicate** — Keep everyone aligned on goals and progress\n\nWhat kind of project are you working on?",
          },
          {
            role: 'user',
            content: "I'm building a mobile-first chat app!",
          },
          {
            role: 'assistant',
            content:
              "Awesome! For a mobile-first chat app, I'd recommend:\n\n- **Start with the core experience** — Basic sending/receiving messages\n- **Optimize for performance** — Fast load times, smooth scrolling\n- **Progressive enhancement** — Add features incrementally\n- **Test on real devices** — Desktop Chrome DevTools won't catch everything\n\nNeed help with architecture or tech stack decisions?",
          },
        ],
      },
    },
  })
  console.log(`  ✓ Session 1: "${session1.title}" (${session1.id})`)

  // Session 2: Completed session about coding
  const session2 = await prisma.session.create({
    data: {
      title: 'TypeScript Best Practices',
      tags: ['coding', 'typescript'],
      status: 'completed',
      messages: {
        create: [
          {
            role: 'user',
            content: 'What are some TypeScript best practices for large projects?',
          },
          {
            role: 'assistant',
            content:
              "Here are some TypeScript best practices for scaling:\n\n1. **Strict mode** — Enable `strict: true` in tsconfig.json\n2. **Type inference** — Let TypeScript infer types when obvious\n3. **Avoid `any`** — Use `unknown` for truly dynamic types\n4. **Domain modeling** — Use discriminated unions for state machines\n5. **Branded types** — Distinguish between primitive types (e.g., UserId vs string)\n6. **Utility types** — Master Pick, Omit, Partial, Required, etc.\n\nWant to dive deeper into any of these?",
          },
          {
            role: 'user',
            content: 'Thanks! That helps a lot.',
          },
        ],
      },
    },
  })
  console.log(`  ✓ Session 2: "${session2.title}" (${session2.id})`)

  // Session 3: Empty active session with tags
  const session3 = await prisma.session.create({
    data: {
      title: 'Quick Ideas',
      tags: ['brainstorm', 'ideas'],
      status: 'active',
    },
  })
  console.log(`  ✓ Session 3: "${session3.title}" (${session3.id})`)

  console.log('\n✅ Seed complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
