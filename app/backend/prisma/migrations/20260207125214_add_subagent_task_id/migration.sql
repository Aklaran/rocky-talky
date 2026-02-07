-- AlterTable
ALTER TABLE "subagents" ADD COLUMN "task_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "subagents_task_id_key" ON "subagents"("task_id");
