-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "SubagentStatus" AS ENUM ('running', 'completed', 'failed');

-- AlterEnum
ALTER TYPE "MessageRole" ADD VALUE 'tool';

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "model_used" TEXT NOT NULL DEFAULT 'claude-opus-4-20250609',
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "compaction_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subagents" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SubagentStatus" NOT NULL DEFAULT 'running',
    "tier" TEXT,
    "output" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "subagents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subagent_messages" (
    "id" TEXT NOT NULL,
    "subagent_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subagent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_messages_session_id_idx" ON "session_messages"("session_id");

-- CreateIndex
CREATE INDEX "subagents_session_id_idx" ON "subagents"("session_id");

-- CreateIndex
CREATE INDEX "subagent_messages_subagent_id_idx" ON "subagent_messages"("subagent_id");

-- AddForeignKey
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subagents" ADD CONSTRAINT "subagents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subagent_messages" ADD CONSTRAINT "subagent_messages_subagent_id_fkey" FOREIGN KEY ("subagent_id") REFERENCES "subagents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
